import type { AuthContext } from '../../types/auth';
import { enforcePlantScope, resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import type { ListQuery } from '../../utils/pagination';
import { conflict, notFound } from '../../utils/httpError';
import { applyPayloadCode, ensureUniqueCode, generateEntityCode, resolvePayloadCode } from '../../utils/codeGenerator';
import { isRootAdminRole, isSuperAdminRole, isAdminRole } from '../../utils/rbac';
import { CrudRepository } from './crud.repository';
import type { GenericRecord, ListResult, ModuleConfig } from './crud.types';
import { audit } from '../../utils/audit';
import { AppDataSource } from '../../database/data-source';

export class CrudService {
  constructor(private readonly config: ModuleConfig, private readonly repository: CrudRepository) {}

  private isRelationProtectedDeleteError(error: unknown): boolean {
    if (typeof error !== 'object' || !error) {
      return false;
    }
    const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
    const driverError = 'driverError' in error ? (error as { driverError?: { code?: unknown } }).driverError : undefined;
    return code === '23503' || driverError?.code === '23503';
  }

  private resolvePlantValue(input: GenericRecord): string | null | undefined {
    const fromCamel = input.plantId as string | null | undefined;
    if (fromCamel !== undefined) {
      return fromCamel;
    }
    if (this.config.plantColumn) {
      return input[this.config.plantColumn] as string | null | undefined;
    }
    return undefined;
  }

  async list(query: ListQuery, auth: AuthContext): Promise<ListResult<GenericRecord>> {
    const scopedPlantIds = this.config.plantColumn ? resolvePlantFilter(auth, query.plantId) : null;
    return this.repository.list(query, scopedPlantIds);
  }

  async getById(id: string, auth: AuthContext): Promise<GenericRecord> {
    const row = await this.repository.getById(id);
    if (!row) {
      notFound(`${this.config.moduleName} record not found`);
    }
    if (this.config.plantColumn) {
      enforcePlantScope(auth, (row[this.config.plantColumn] as string | null | undefined) ?? null);
    }
    return row;
  }

  async create(input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    if (this.config.plantColumn) {
      const scopedPlantId = resolveScopedPlantId(auth, this.resolvePlantValue(input) ?? null);
      enforcePlantScope(auth, scopedPlantId);
      if (scopedPlantId !== null) {
        input.plantId = scopedPlantId;
        input[this.config.plantColumn] = scopedPlantId;
      }
    }

    if (this.config.codeColumn) {
      const currentCode = resolvePayloadCode({ tableName: this.config.tableName, codeColumn: this.config.codeColumn, input });
      const plantId = this.resolvePlantValue(input) ?? null;
      const organizationId = auth.organizationId ?? null;
      const normalizedCode = currentCode?.trim() || null;

      if (normalizedCode) {
        const exists = await ensureUniqueCode({
          tableName: this.config.tableName,
          codeColumn: this.config.codeColumn,
          code: normalizedCode,
          scope: {
            plantColumn: this.config.plantColumn,
            plantId: plantId ?? null,
            organizationColumn: this.config.organizationColumn,
            organizationId,
          },
        });
        if (exists) {
          conflict(this.config.uniqueCodeMessage || `${this.config.moduleName} code already exists`);
        }
      } else if (this.config.codeType) {
        const generated = await generateEntityCode({
          tableName: this.config.tableName,
          codeColumn: this.config.codeColumn,
          typeCode: this.config.codeType,
          plantId: plantId ?? null,
          organizationId,
          scope: {
            plantColumn: this.config.plantColumn,
            plantId: plantId ?? null,
            organizationColumn: this.config.organizationColumn,
            organizationId,
          },
        });
        applyPayloadCode({ tableName: this.config.tableName, codeColumn: this.config.codeColumn, input, code: generated });
      }
    }
    return this.repository.create(input);
  }

  async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const existing = await this.getById(id, auth);
    if (this.config.plantColumn) {
      const scopedPlantId = resolveScopedPlantId(
        auth,
        this.resolvePlantValue(input) ?? (existing[this.config.plantColumn] as string | null | undefined),
      );
      enforcePlantScope(auth, scopedPlantId);
      if (scopedPlantId !== null) {
        input.plantId = scopedPlantId;
        input[this.config.plantColumn] = scopedPlantId;
      }
    }

    if (this.config.codeColumn) {
      const incomingCode = resolvePayloadCode({ tableName: this.config.tableName, codeColumn: this.config.codeColumn, input });
      if (incomingCode) {
        const plantId = this.resolvePlantValue(input) ?? (existing[this.config.plantColumn ?? ''] as string | null | undefined) ?? null;
        const organizationId = auth.organizationId ?? null;
        const exists = await ensureUniqueCode({
          tableName: this.config.tableName,
          codeColumn: this.config.codeColumn,
          code: incomingCode,
          scope: {
            plantColumn: this.config.plantColumn,
            plantId: plantId ?? null,
            organizationColumn: this.config.organizationColumn,
            organizationId,
          },
          excludeId: id,
        });
        if (exists) {
          conflict(this.config.uniqueCodeMessage || `${this.config.moduleName} code already exists`);
        }
        applyPayloadCode({ tableName: this.config.tableName, codeColumn: this.config.codeColumn, input, code: incomingCode });
      }
    }

    const updated = await this.repository.update(id, input);
    if (!updated) {
      notFound(`${this.config.moduleName} record not found`);
    }
    return updated;
  }

  private isAdminLevel(roles: string[]): boolean {
    return roles.some((role) => isRootAdminRole(role) || isSuperAdminRole(role) || isAdminRole(role));
  }

  async remove(id: string, auth: AuthContext): Promise<void> {
    const record = await this.getById(id, auth);
    if (this.isAdminLevel(auth.roles)) {
      await this.cascadeDelete(id, auth, record);
      return;
    }
    await this.repository.softDelete(id);
  }

  private async cascadeDelete(id: string, auth: AuthContext, record: GenericRecord): Promise<void> {
    const entityMetadata = AppDataSource.entityMetadatas.find(
      (m) => m.tableName === this.config.tableName,
    );

    if (entityMetadata) {
      for (const related of AppDataSource.entityMetadatas) {
        for (const fk of related.foreignKeys) {
          if (fk.referencedTablePath !== this.config.tableName) continue;
          const fkColumn = fk.columns[0]?.databaseName;
          if (!fkColumn) continue;

          const children = await AppDataSource.createQueryBuilder()
            .select('id')
            .from(related.tableName, 't')
            .where(`t.${fkColumn} = :id`, { id })
            .getRawMany<{ id: string }>();

          if (children.length > 0) {
            const childIds = children.map((c) => c.id);
            await AppDataSource.createQueryBuilder()
              .delete()
              .from(related.tableName)
              .where(`${fkColumn} = :id`, { id })
              .execute();

            await audit(`${this.config.moduleName}.cascade-delete`, {
              module: this.config.moduleName.toUpperCase(),
              entityName: related.tableName,
              entityId: id,
              actorUserId: auth.userId ?? null,
              actorRoles: auth.roles,
              method: 'DELETE',
              path: `/api/${this.config.moduleName}/${id}`,
              plantId:
                typeof record.plantId === 'string'
                  ? record.plantId
                  : typeof record.plant_id === 'string'
                    ? record.plant_id
                    : null,
              statusCode: 200,
              metadata: { cascadeCount: children.length, deletedIds: childIds },
            });
          }
        }
      }
    }

    try {
      await this.repository.hardDelete(id);
    } catch (error) {
      if (this.isRelationProtectedDeleteError(error)) {
        conflict(`${this.config.moduleName} cannot be deleted because related records still exist.`);
      }
      throw error;
    }
  }
}
