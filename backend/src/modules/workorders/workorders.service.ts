import { AppDataSource } from '../../database/data-source';
import { AssetEntity, MaintenanceTeamEntity, NotificationEntity, WorkOrderEntity, WorkOrderMasterEntity, WorkOrderTeamMappingEntity } from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import { badRequest } from '../../utils/httpError';
import { enforcePlantScope, resolveScopedPlantId } from '../../utils/plantScope';
import type { GenericRecord } from '../_core/crud.types';
import { CrudService } from '../_core/crud.service';
import { notifyBreakdownWorkOrderRaised } from '../amc/amc.helpers';
import { applySpareUsageDelta, formatSpareUsageSummary, normalizeSpareUsage } from '../inventory/spare-consumption';
import { ensureDefaultWorkOrderMasters } from '../workOrderMasters/work-order-master.helpers';
import { normalizeWorkOrderMasterCode, type WorkOrderMasterOptionType } from '../workOrderMasters/work-order-master.defaults';
import { workordersRepository } from './workorders.repository';
import { IsNull } from 'typeorm';

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

function toEntityPayload(input: GenericRecord): GenericRecord {
  const metadata = AppDataSource.getRepository(WorkOrderEntity).metadata;
  const blockedKeys = new Set(['id', 'createdAt', 'updatedAt', 'version']);
  const result: GenericRecord = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const column = metadata.columns.find((candidate) => candidate.propertyName === key || candidate.databaseName === key);
    const propertyName = column?.propertyName;
    if (!propertyName || blockedKeys.has(propertyName)) continue;
    result[propertyName] = value;
  }

  return result;
}

function generateWorkOrderNumber(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `WO-${yyyy}${mm}${dd}-${rand}`;
}

function normalizeCategory(input: string): string {
  return normalizeWorkOrderMasterCode(input);
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

class WorkOrdersService extends CrudService {
  private readonly assetsRepo = AppDataSource.getRepository(AssetEntity);
  private readonly workOrderMastersRepo = AppDataSource.getRepository(WorkOrderMasterEntity);
  private readonly teamMappingsRepo = AppDataSource.getRepository(WorkOrderTeamMappingEntity);
  private readonly teamsRepo = AppDataSource.getRepository(MaintenanceTeamEntity);
  private readonly notificationsRepo = AppDataSource.getRepository(NotificationEntity);

  constructor() {
    super(
      {
        moduleName: 'workorders',
        moduleId: 'WORK_ORDERS',
        basePath: '/api/work-orders',
        tableName: 'work_orders',
        plantColumn: 'plant_id',
      },
      workordersRepository,
    );
  }

  private async validateMasterOption(
    plantId: string | null,
    optionType: WorkOrderMasterOptionType,
    value: string | null | undefined,
  ): Promise<string | null> {
    if (value === undefined || value === null || String(value).trim().length === 0) {
      return null;
    }

    const normalizedValue = normalizeWorkOrderMasterCode(String(value));
    if (!plantId) {
      return normalizedValue;
    }

    await ensureDefaultWorkOrderMasters([plantId]);
    const option = await this.workOrderMastersRepo.findOne({
      where: { plantId, optionType, code: normalizedValue, isActive: true },
      select: ['id'],
    });
    if (!option) {
      badRequest(`Invalid ${optionType.toLowerCase()} value`, { optionType, value: normalizedValue });
    }

    return normalizedValue;
  }

  async create(input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    const normalized = normalizeKeys(input);

    const assetId = normalized.asset_id as string | undefined;
    const category = normalized.category as string | undefined;
    const problemDescription = normalized.problem_description as string | undefined;
    if (!assetId || !category || !problemDescription) {
      badRequest('asset_id, category and problem_description are required');
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

    const normalizedCategory = await this.validateMasterOption(plantId, 'CATEGORY', category);
    const normalizedWorkOrderType = await this.validateMasterOption(
      plantId,
      'WO_TYPE',
      String(normalized.wo_type ?? 'BREAKDOWN'),
    );
    const normalizedFailureCode = await this.validateMasterOption(
      plantId,
      'FAILURE_CODE',
      (normalized.failure_code as string | null | undefined) ?? null,
    );
    let categoryMapping = null;
    if (plantId && asset.departmentId) {
      categoryMapping = await this.teamMappingsRepo.findOne({
        where: { plantId, departmentId: asset.departmentId, category: normalizedCategory as string },
        select: ['teamId'],
      });
    }
    if (!categoryMapping && plantId) {
      categoryMapping = await this.teamMappingsRepo.findOne({
        where: { plantId, departmentId: IsNull(), category: normalizedCategory as string },
        select: ['teamId'],
      });
    }
    const assignedTeam = categoryMapping && plantId
      ? await this.teamsRepo.findOne({
          where: { id: categoryMapping.teamId, plantId, isActive: true },
          select: ['id', 'teamLeaderId', 'teamMemberIds', 'teamName'],
        })
      : null;

    const woNumber = typeof normalized.wo_number === 'string' ? normalized.wo_number.trim() : '';
    const payload: GenericRecord = {
      ...normalized,
      wo_number: woNumber || generateWorkOrderNumber(),
      category: normalizedCategory,
      wo_type: normalizedWorkOrderType,
      failure_code: normalizedFailureCode,
      raised_by: normalized.raised_by ?? auth.userId,
      assigned_to: normalized.assigned_to ?? assignedTeam?.teamLeaderId ?? null,
      plant_id: plantId,
      plantId,
    };

    const createdWorkOrder = await super.create(payload, auth);

    if (assignedTeam) {
      const recipientIds = uniqueIds([assignedTeam.teamLeaderId, ...(assignedTeam.teamMemberIds ?? [])]);
      if (recipientIds.length > 0) {
        const notifications = recipientIds.map((userId) =>
          this.notificationsRepo.create({
            userId,
            title: 'New Work Order Assigned',
            message: `${String(createdWorkOrder.wo_number ?? payload.wo_number)} has been assigned to ${assignedTeam.teamName}.`,
            type: 'warning',
            link: '/work-orders',
            woId: String(createdWorkOrder.id),
          }),
        );
        await this.notificationsRepo.save(notifications);
      }
    }

    await notifyBreakdownWorkOrderRaised(String(createdWorkOrder.id));

    return createdWorkOrder;
  }

  async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await manager.createQueryBuilder().select('t.*').from('work_orders', 't').where('t.id = :id', { id }).getRawOne<GenericRecord>();
      if (!existing) {
        badRequest('workorders record not found');
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

      const normalizedCategory = normalized.category !== undefined
        ? await this.validateMasterOption(plantId, 'CATEGORY', String(normalized.category))
        : undefined;
      const normalizedWorkOrderType = normalized.wo_type !== undefined
        ? await this.validateMasterOption(plantId, 'WO_TYPE', String(normalized.wo_type))
        : undefined;
      const normalizedFailureCode = normalized.failure_code !== undefined
        ? await this.validateMasterOption(
            plantId,
            'FAILURE_CODE',
            normalized.failure_code === null ? null : String(normalized.failure_code),
          )
        : undefined;

      const previousUsage = normalizeSpareUsage(existing.spare_consumption);
      const nextUsage = normalized.spare_consumption !== undefined ? normalizeSpareUsage(normalized.spare_consumption) : previousUsage;
      const previousStatus = String(existing.status ?? '').toUpperCase();
      const nextStatus = String(normalized.status ?? existing.status ?? '').toUpperCase();

      await applySpareUsageDelta(
        manager,
        previousStatus === 'CLOSED' ? previousUsage : [],
        nextStatus === 'CLOSED' ? nextUsage : [],
        { plantId, assetId: nextAssetId },
      );

      const payload: GenericRecord = {
        ...normalized,
        asset_id: nextAssetId,
        plant_id: plantId,
        ...(normalizedCategory !== undefined ? { category: normalizedCategory } : {}),
        ...(normalizedWorkOrderType !== undefined ? { wo_type: normalizedWorkOrderType } : {}),
        ...(normalizedFailureCode !== undefined ? { failure_code: normalizedFailureCode } : {}),
        spare_consumption: nextUsage.length > 0 ? nextUsage : null,
      };

      if (normalized.parts_replaced === undefined && nextUsage.length > 0) {
        payload.parts_replaced = formatSpareUsageSummary(nextUsage);
      }

      const sanitizedPayload = toEntityPayload(sanitizePayload(payload));
      if (Object.keys(sanitizedPayload).length > 0) {
        await manager.createQueryBuilder().update('work_orders').set(sanitizedPayload as never).where('id = :id', { id }).execute();
      }

      const updated = await manager.createQueryBuilder().select('t.*').from('work_orders', 't').where('t.id = :id', { id }).getRawOne<GenericRecord>();
      return updated as GenericRecord;
    });
  }
}

export const workordersService = new WorkOrdersService();
