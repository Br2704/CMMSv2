import { AppDataSource } from '../database/data-source';
import { audit } from './audit';

type CascadeDeleteParams = {
  tableName: string;
  moduleName: string;
  entityId: string;
  authUserId: string | null;
  authRoles: string[];
  path: string;
  plantId: string | null;
};

function resolveChildId(row: Record<string, unknown>): string | null {
  const candidate = row.id ?? row["id"];
  return typeof candidate === 'string' ? candidate : null;
}

export async function cascadeDeleteRelatedRecords(params: CascadeDeleteParams): Promise<void> {
  for (const related of AppDataSource.entityMetadatas) {
    for (const fk of related.foreignKeys) {
      if (fk.referencedTablePath !== params.tableName) continue;
      const fkColumn = fk.columns[0]?.databaseName;
      if (!fkColumn) continue;

      const children = await AppDataSource.createQueryBuilder()
        .select('id')
        .from(related.tableName, 't')
        .where(`t.${fkColumn} = :id`, { id: params.entityId })
        .getRawMany<Record<string, unknown>>();

      if (children.length === 0) {
        continue;
      }

      const childIds = children.map(resolveChildId).filter((value): value is string => Boolean(value));
      await AppDataSource.createQueryBuilder()
        .delete()
        .from(related.tableName)
        .where(`${fkColumn} = :id`, { id: params.entityId })
        .execute();

      await audit(`${params.moduleName}.cascade-delete`, {
        module: params.moduleName.toUpperCase(),
        entityName: related.tableName,
        entityId: params.entityId,
        actorUserId: params.authUserId,
        actorRoles: params.authRoles,
        method: 'DELETE',
        path: params.path,
        plantId: params.plantId,
        statusCode: 200,
        metadata: { cascadeCount: children.length, deletedIds: childIds },
      });
    }
  }
}