import { AppDataSource } from '../../database/data-source';
import { AssetEntity } from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import { badRequest } from '../../utils/httpError';
import { enforcePlantScope, resolveScopedPlantId } from '../../utils/plantScope';
import type { GenericRecord } from '../_core/crud.types';
import { CrudService } from '../_core/crud.service';
import { applySpareUsageDelta, normalizeSpareUsage, parseJsonObject, stringifyJsonObject } from '../inventory/spare-consumption';
import { pmschedulesRepository } from './pmschedules.repository';

function toSnakeKey(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

function normalizeKeys(input: GenericRecord): GenericRecord {
  const result: GenericRecord = {};
  for (const [key, value] of Object.entries(input)) {
    result[toSnakeKey(key)] = value;
  }
  return result;
}

function sanitizePayload(input: GenericRecord): GenericRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

class PMSchedulesService extends CrudService {
  private readonly assetsRepo = AppDataSource.getRepository(AssetEntity);

  constructor() {
    super(
      {
        moduleName: 'pmschedules',
        moduleId: 'PM_SCHEDULES',
        basePath: '/api/pm-schedules',
        tableName: 'pm_schedules',
        plantColumn: 'plant_id',
      },
      pmschedulesRepository,
    );
  }

  async create(input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const normalized = normalizeKeys(input);
      const assetId = normalized.asset_id as string | undefined;
      if (!assetId) {
        badRequest('asset_id is required');
      }

      const asset = await this.assetsRepo.findOneBy({ id: assetId, isActive: true });
      if (!asset) {
        badRequest('Invalid asset_id');
      }

      const requestedPlantId = (normalized.plant_id as string | null | undefined) ?? null;
      const inferredPlantId = asset.plantId ?? null;
      const plantId = resolveScopedPlantId(auth, requestedPlantId ?? inferredPlantId ?? null);
      if (requestedPlantId && inferredPlantId && requestedPlantId !== inferredPlantId) {
        badRequest('asset_id does not belong to selected plant');
      }
      enforcePlantScope(auth, plantId);

      const checklistData = parseJsonObject(normalized.checklist);
      const nextUsage = normalizeSpareUsage(checklistData.spareUsage);
      if (String(normalized.status ?? 'SCHEDULED').toUpperCase() === 'COMPLETED') {
        await applySpareUsageDelta(manager, [], nextUsage, { plantId, assetId });
      }

      const payload = sanitizePayload({
        ...normalized,
        plant_id: plantId,
        checklist: Object.keys(checklistData).length > 0 ? stringifyJsonObject(checklistData) : null,
      });

      const insertResult = await manager.createQueryBuilder().insert().into('pm_schedules').values(payload).execute();
      const createdId = String(insertResult.identifiers[0]?.id ?? '');
      const created = await manager
        .createQueryBuilder()
        .select('t.*')
        .from('pm_schedules', 't')
        .where('t.id = :id', { id: createdId })
        .getRawOne<GenericRecord>();
      return created as GenericRecord;
    });
  }

  async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await manager.createQueryBuilder().select('t.*').from('pm_schedules', 't').where('t.id = :id', { id }).getRawOne<GenericRecord>();
      if (!existing) {
        badRequest('pmschedules record not found');
      }

      enforcePlantScope(auth, (existing.plant_id as string | null | undefined) ?? null);
      const normalized = normalizeKeys(input);
      const nextAssetId = (normalized.asset_id as string | undefined) ?? (existing.asset_id as string);
      const asset = await this.assetsRepo.findOneBy({ id: nextAssetId, isActive: true });
      if (!asset) {
        badRequest('Invalid asset_id');
      }

      const requestedPlantId = (normalized.plant_id as string | null | undefined) ?? null;
      const inferredPlantId = asset.plantId ?? null;
      const plantId = resolveScopedPlantId(auth, requestedPlantId ?? inferredPlantId ?? null);
      if (requestedPlantId && inferredPlantId && requestedPlantId !== inferredPlantId) {
        badRequest('asset_id does not belong to selected plant');
      }
      enforcePlantScope(auth, plantId);

      const existingChecklist = parseJsonObject(existing.checklist);
      const incomingChecklist = normalized.checklist === undefined ? existingChecklist : parseJsonObject(normalized.checklist);

      const previousUsage = normalizeSpareUsage(existingChecklist.spareUsage);
      const nextUsage = normalizeSpareUsage(incomingChecklist.spareUsage);
      const previousStatus = String(existing.status ?? '').toUpperCase();
      const nextStatus = String(normalized.status ?? existing.status ?? '').toUpperCase();

      await applySpareUsageDelta(
        manager,
        previousStatus === 'COMPLETED' ? previousUsage : [],
        nextStatus === 'COMPLETED' ? nextUsage : [],
        { plantId, assetId: nextAssetId },
      );

      const payload: GenericRecord = {
        ...normalized,
        asset_id: nextAssetId,
        plant_id: plantId,
        checklist: Object.keys(incomingChecklist).length > 0 ? stringifyJsonObject(incomingChecklist) : null,
      };

      const sanitizedPayload = sanitizePayload(payload);
      await manager.createQueryBuilder().update('pm_schedules').set(sanitizedPayload as never).where('id = :id', { id }).execute();
      const updated = await manager.createQueryBuilder().select('t.*').from('pm_schedules', 't').where('t.id = :id', { id }).getRawOne<GenericRecord>();
      return updated as GenericRecord;
    });
  }
}

export const pmschedulesService = new PMSchedulesService();
