import { randomUUID } from 'node:crypto';
import { AppDataSource } from '../../database/data-source';
import {
  AssetEntity,
  MaintenanceTeamEntity,
  NotificationEntity,
  UserEntity,
  WorkOrderActivityLogEntity,
  WorkOrderEntity,
  WorkOrderMasterEntity,
  WorkOrderTeamMappingEntity,
} from '../../database/entities';
import type { AuthContext } from '../../types/auth';
import { badRequest, conflict, forbidden } from '../../utils/httpError';
import { canAccessWorkOrder } from '../../utils/authorization';
import { enforcePlantScope, resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import type { GenericRecord, ListResult } from '../_core/crud.types';
import { CrudService } from '../_core/crud.service';
import { notifyBreakdownWorkOrderRaised } from '../amc/amc.helpers';
import { sendNewWorkOrderEmails, sendWorkOrderAssignedEmails, sendWorkOrderCompletedEmails, sendWorkOrderClosedEmails, sendWorkOrderRejectedEmails, sendWorkOrderCancelledEmails } from '../../services/notification-helper';
import { isMailConfigured } from '../../services/mail.service';
import { applySpareUsageDelta, formatSpareUsageSummary, normalizeSpareUsage } from '../inventory/spare-consumption';
import { ensureDefaultWorkOrderMasters } from '../workOrderMasters/work-order-master.helpers';
import { normalizeWorkOrderMasterCode, type WorkOrderMasterOptionType } from '../workOrderMasters/work-order-master.defaults';
import { workordersRepository } from './workorders.repository';
import { AnalyticsService } from './analytics.service';
import { In, IsNull, QueryFailedError } from 'typeorm';
import type { ListQuery } from '../../utils/pagination';

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

const WORKFLOW_STATUSES = {
  RAISED: 'RAISED',
  TRIAGED: 'TRIAGED',
  ASSIGNED: 'ASSIGNED',
  ACCEPTED: 'ACCEPTED',
  OPENED: 'OPENED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  USER_VERIFICATION: 'USER_VERIFICATION',
  APPROVAL_PENDING: 'APPROVAL_PENDING',
  REASSIGNED: 'REASSIGNED',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;

const PENDING_APPROVAL_STATUSES = [
  WORKFLOW_STATUSES.USER_VERIFICATION,
  WORKFLOW_STATUSES.APPROVAL_PENDING,
] as const;

function isPendingApprovalStatus(status: string): boolean {
  return PENDING_APPROVAL_STATUSES.includes(status as (typeof PENDING_APPROVAL_STATUSES)[number]);
}

function validateWhyWhyAnalysis(value: unknown): Record<string, string> | null {
  const parsed = parseJsonObject(value);
  if (!parsed) return null;
  const requiredKeys = [
    'why_1',
    'why_2',
    'why_3',
    'why_4',
    'why_5',
    'root_reason',
    'corrective_prevention',
    'recurrence_prevention',
  ];
  const result: Record<string, string> = {};
  for (const key of requiredKeys) {
    const normalized = normalizeText(parsed[key]);
    if (!normalized) {
      badRequest(`why_why_analysis.${key} is required when downtime exceeds 120 minutes`);
    }
    result[key] = normalized;
  }
  return result;
}

const WORKFLOW_MANAGED_FIELDS = new Set([
  'status',
  'opened_at',
  'closed_at',
  'started_at',
  'resolved_at',
  'cancelled_at',
  'cancelled_by',
  'cancellation_reason',
  'technician_verification',
  'safety_checklist',
  'submitted_for_approval_at',
  'submitted_for_approval_by',
  'approved_by',
  'approved_at',
  'rejected_by',
  'rejected_at',
  'approval_comments',
  'admin_override_by',
  'admin_override_at',
  'admin_override_reason',
]);

const INCHARGE_CATEGORY_MAP: Record<string, string> = {
  MAINTENANCE_MANAGER: 'MECHANICAL',
  PRODUCTION_MANAGER: 'PRODUCTION',
  SCM_MANAGER: 'SUPPLY_CHAIN',
  HR_MANAGER: 'PEOPLE',
  CALIBRATION_MANAGER: 'CALIBRATION',
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toUpperText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  }
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function minutesToLaborHours(value: unknown): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }
  return Number((minutes / 60).toFixed(2));
}

function parseDateTime(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function elapsedMinutes(startValue: unknown, endAt: Date): number {
  const start = parseDateTime(startValue);
  if (!start) return 0;
  const diffMs = endAt.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.max(0, Math.round(diffMs / 60000));
}

function hasAnyWorkflowManagedField(input: GenericRecord): boolean {
  return Object.keys(input).some((key) => WORKFLOW_MANAGED_FIELDS.has(key));
}

function toScalar(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function readOptionalString(value: unknown): string | null {
  const scalar = toScalar(value);
  if (typeof scalar !== 'string') {
    return null;
  }
  const trimmed = scalar.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalBoolean(value: unknown): boolean | null {
  const scalar = toScalar(value);
  if (typeof scalar === 'boolean') {
    return scalar;
  }
  if (typeof scalar === 'string') {
    const normalized = scalar.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

function toNumber(value: unknown): number {
  const parsed = Number(toScalar(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

type WorkOrderScope = 'assigned' | 'raised' | 'incharge' | 'team' | 'all' | 'approval_required';

function normalizeScope(value: unknown): WorkOrderScope | null {
  const raw = readOptionalString(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === 'assigned') return 'assigned';
  if (normalized === 'raised') return 'raised';
  if (normalized === 'incharge') return 'incharge';
  if (normalized === 'all') return 'all';
  if (normalized === 'team' || normalized === 'my_team') {
    return 'team';
  }
  if (normalized === 'approval_required' || normalized === 'approval-required' || normalized === 'approval') {
    return 'approval_required';
  }
  return null;
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

  private getInchargeCategories(auth: AuthContext): string[] {
    const roles = auth.roles.map((role) => String(role).toUpperCase());
    return Array.from(new Set(roles.map((role) => INCHARGE_CATEGORY_MAP[role]).filter((value): value is string => Boolean(value))));
  }

  private normalizeListQuery(query: ListQuery) {
    const extended = query as ListQuery & Record<string, unknown>;
    const page = Math.max(1, Number(toScalar(query.page) || 1));
    const limit = Math.min(1000, Math.max(1, Number(toScalar(query.limit) || 100)));
    const search = readOptionalString(query.search)?.toLowerCase() ?? '';

    const statusFilterRaw = readOptionalString(extended.status);
    const statusFilter = statusFilterRaw && statusFilterRaw.toUpperCase() !== 'ALL' ? statusFilterRaw.toUpperCase() : null;

    const categoryFilterRaw = readOptionalString(extended.category);
    const categoryFilter =
      categoryFilterRaw && categoryFilterRaw.toUpperCase() !== 'ALL' ? normalizeCategory(categoryFilterRaw) : null;

    const woTypeFilterRaw = readOptionalString(extended.wo_type) ?? readOptionalString(extended.woType);
    const woTypeFilter =
      woTypeFilterRaw && woTypeFilterRaw.toUpperCase() !== 'ALL' ? normalizeWorkOrderMasterCode(woTypeFilterRaw) : null;

    const scope = normalizeScope(extended.scope);
    const approvalRequired =
      readOptionalBoolean(extended.approval_required) ?? readOptionalBoolean(extended.approvalRequired) ?? false;
    const escalationOnly =
      readOptionalBoolean(extended.escalation_only) ?? readOptionalBoolean(extended.escalationOnly) ?? false;

    const dateFrom = readOptionalString(extended.date_from);
    const dateTo = readOptionalString(extended.date_to);

    const sortRaw = readOptionalString(query.sort);
    const [requestedSortColumn, requestedSortDirection] = sortRaw ? sortRaw.split(':') : [];
    const allowedSortColumns = new Set([
      'created_at',
      'updated_at',
      'status',
      'priority',
      'wo_number',
      'closed_at',
      'submitted_for_approval_at',
    ]);
    const sortColumn = requestedSortColumn && allowedSortColumns.has(requestedSortColumn) ? requestedSortColumn : 'created_at';
    const sortDirection = requestedSortDirection?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    return {
      page,
      limit,
      search,
      statusFilter,
      categoryFilter,
      woTypeFilter,
      scope,
      approvalRequired,
      escalationOnly,
      sortColumn,
      sortDirection,
      dateFrom,
      dateTo,
    };
  }

  async list(query: ListQuery, auth: AuthContext): Promise<ListResult<GenericRecord>> {
    const scopedPlantIds = resolvePlantFilter(auth, query.plantId);
    const {
      page,
      limit,
      search,
      statusFilter,
      categoryFilter,
      woTypeFilter,
      scope,
      approvalRequired,
      escalationOnly,
      sortColumn,
      sortDirection,
      dateFrom,
      dateTo,
    } = this.normalizeListQuery(query);

    const effectiveScope: WorkOrderScope | null = approvalRequired ? 'approval_required' : scope;
    const inchargeCategories = this.getInchargeCategories(auth);
    const canApproveAny = this.isAdminActor(auth);

    const qb = AppDataSource.createQueryBuilder()
      .select('t.*')
      .addSelect('asset.id', 'asset_ref_id')
      .addSelect('asset.code', 'asset_ref_code')
      .addSelect('asset.name', 'asset_ref_name')
      .from('work_orders', 't')
      .leftJoin('assets', 'asset', 'asset.id = t.asset_id');

    if (scopedPlantIds) {
      if (scopedPlantIds.length === 0) {
        return { items: [], total: 0 };
      }
      qb.andWhere('t.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
    }

    if (effectiveScope === 'assigned') {
      const teamIds = auth.teamIds ?? [];
      if (teamIds.length > 0) {
        qb.andWhere(
          `(t.assigned_to = :actorUserId OR (t.category IN (
            SELECT DISTINCT wm.category FROM work_order_team_mappings wm WHERE wm.team_id IN (:...teamIds)
          ) AND (t.raised_by IS NULL OR t.raised_by <> :actorUserId)))`,
          { actorUserId: auth.userId, teamIds }
        );
      } else {
        qb.andWhere('t.assigned_to = :actorUserId', { actorUserId: auth.userId });
      }
    }

    if (effectiveScope === 'raised') {
      qb.andWhere('t.raised_by = :actorUserId', { actorUserId: auth.userId });
    }

    if (effectiveScope === 'incharge') {
      if (inchargeCategories.length === 0) {
        return { items: [], total: 0 };
      }
      qb.andWhere('t.category IN (:...inchargeCategories)', { inchargeCategories });
      qb.andWhere('(t.raised_by IS NULL OR t.raised_by <> :actorUserId)', { actorUserId: auth.userId });
    }

    if (effectiveScope === 'team') {
      const teamIds = auth.teamIds ?? [];
      if (teamIds.length === 0) {
        return { items: [], total: 0 };
      }
      // Subquery: find categories that are mapped to the user's maintenance teams
      const teamCategoriesSubQuery = qb
        .subQuery()
        .select('DISTINCT wm.category')
        .from('work_order_team_mappings', 'wm')
        .where('wm.team_id IN (:...teamIds)', { teamIds })
        .getQuery();
      qb.andWhere(`t.category IN (${teamCategoriesSubQuery})`, { teamIds });
      // Exclude work orders the user raised themselves (already visible in 'raised' tab)
      qb.andWhere('(t.raised_by IS NULL OR t.raised_by <> :actorUserId)', { actorUserId: auth.userId });
    }

    if (effectiveScope === 'approval_required') {
      qb.andWhere('t.status IN (:...pendingStatuses)', {
        pendingStatuses: [...PENDING_APPROVAL_STATUSES],
      });
      if (!canApproveAny) {
        qb.andWhere('t.raised_by = :actorUserId', { actorUserId: auth.userId });
      }
    }

    if (statusFilter) {
      qb.andWhere('t.status = :statusFilter', { statusFilter });
    }

    if (categoryFilter) {
      qb.andWhere('t.category = :categoryFilter', { categoryFilter });
    }

    if (woTypeFilter) {
      qb.andWhere('t.wo_type = :woTypeFilter', { woTypeFilter });
    }

    if (escalationOnly) {
      qb.andWhere('t.escalation_level IS NOT NULL');
    }

    if (search) {
      qb.andWhere(
        `(
          LOWER(t.wo_number) LIKE :search
          OR LOWER(COALESCE(t.problem_description, '')) LIKE :search
          OR LOWER(COALESCE(t.category, '')) LIKE :search
          OR LOWER(COALESCE(t.status, '')) LIKE :search
          OR LOWER(COALESCE(asset.code, '')) LIKE :search
          OR LOWER(COALESCE(asset.name, '')) LIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    if (dateFrom) {
      qb.andWhere('t.created_at >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      const dateToEnd = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59.999Z`;
      qb.andWhere('t.created_at <= :dateTo', { dateTo: dateToEnd });
    }

    const totalQb = qb.clone().select('COUNT(1)', 'count');
    qb
      .orderBy(`t.${sortColumn}`, sortDirection as 'ASC' | 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);

    const [rows, totalRaw] = await Promise.all([
      qb.getRawMany<GenericRecord & { asset_ref_id?: string | null; asset_ref_code?: string | null; asset_ref_name?: string | null }>(),
      totalQb.getRawOne<{ count: string | number }>(),
    ]);

    const items = rows.map((row) => {
      const item: GenericRecord = { ...row };
      const assetId = typeof row.asset_ref_id === 'string' ? row.asset_ref_id : null;
      item.assets = assetId
        ? {
          id: assetId,
          code: row.asset_ref_code ?? null,
          name: row.asset_ref_name ?? null,
        }
        : null;
      delete item.asset_ref_id;
      delete item.asset_ref_code;
      delete item.asset_ref_name;
      return item;
    });

    return { items, total: Number(totalRaw?.count ?? 0) };
  }

  async getQueueSummary(query: ListQuery, auth: AuthContext): Promise<GenericRecord> {
    const scopedPlantIds = resolvePlantFilter(auth, query.plantId);
    const canApproveAny = this.isAdminActor(auth);
    const inchargeCategories = this.getInchargeCategories(auth);
    const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const teamIds = auth.teamIds ?? [];

    const qb = AppDataSource.createQueryBuilder().from('work_orders', 't');
    if (scopedPlantIds) {
      if (scopedPlantIds.length === 0) {
        return {
          tabs: {
            assigned: 0,
            raised: 0,
            incharge: 0,
            all: 0,
            approvalRequired: 0,
          },
          kpis: {
            open: 0,
            closedLast24h: 0,
            pendingApproval: 0,
            total: 0,
          },
          defaultScope: canApproveAny ? 'all' : inchargeCategories.length > 0 ? 'incharge' : 'assigned',
        };
      }
      qb.andWhere('t.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
    }

    qb
      .select('COUNT(1)', 'total_count')
      .addSelect(
        teamIds.length > 0
          ? `SUM(CASE WHEN t.assigned_to = :actorUserId OR (t.category IN (SELECT DISTINCT wm.category FROM work_order_team_mappings wm WHERE wm.team_id IN (:...teamIds)) AND (t.raised_by IS NULL OR t.raised_by <> :actorUserId)) THEN 1 ELSE 0 END)`
          : `SUM(CASE WHEN t.assigned_to = :actorUserId THEN 1 ELSE 0 END)`,
        'assigned_count'
      )
      .addSelect('SUM(CASE WHEN t.raised_by = :actorUserId THEN 1 ELSE 0 END)', 'raised_count')
      .addSelect(
        inchargeCategories.length > 0
          ? 'SUM(CASE WHEN t.category IN (:...inchargeCategories) AND (t.raised_by IS NULL OR t.raised_by <> :actorUserId) THEN 1 ELSE 0 END)'
          : '0',
        'incharge_count',
      )
      .addSelect(
        canApproveAny
          ? 'SUM(CASE WHEN t.status IN (:...pendingApprovalStatuses) THEN 1 ELSE 0 END)'
          : 'SUM(CASE WHEN t.status IN (:...pendingApprovalStatuses) AND t.raised_by = :actorUserId THEN 1 ELSE 0 END)',
        'approval_queue_count',
      )
      .addSelect('SUM(CASE WHEN t.status <> :closedStatus THEN 1 ELSE 0 END)', 'open_count')
      .addSelect(
        'SUM(CASE WHEN t.status = :closedStatus AND t.closed_at IS NOT NULL AND t.closed_at >= :recentThreshold THEN 1 ELSE 0 END)',
        'closed_last_24h_count',
      )
      .addSelect('SUM(CASE WHEN t.status IN (:...pendingApprovalStatuses) THEN 1 ELSE 0 END)', 'pending_approval_count')
      .addSelect('SUM(CASE WHEN t.escalation_level IS NOT NULL THEN 1 ELSE 0 END)', 'escalated_count')
      .setParameters({
        actorUserId: auth.userId,
        inchargeCategories,
        closedStatus: WORKFLOW_STATUSES.CLOSED,
        pendingApprovalStatuses: [...PENDING_APPROVAL_STATUSES],
        recentThreshold,
        teamIds,
      });

    // Add team count if user belongs to any teams
    const teamCountQb =
      teamIds.length > 0
        ? AppDataSource.createQueryBuilder()
            .select('COUNT(1)', 'team_count')
            .from('work_orders', 't')
            .where(
              `t.category IN (SELECT DISTINCT wm.category FROM work_order_team_mappings wm WHERE wm.team_id IN (:...teamIds))`,
              { teamIds },
            )
            .andWhere('(t.raised_by IS NULL OR t.raised_by <> :actorUserId)', { actorUserId: auth.userId })
        : null;

    if (scopedPlantIds && teamCountQb) {
      if (scopedPlantIds.length === 0) {
        teamCountQb.andWhere('1 = 0');
      } else {
        teamCountQb.andWhere('t.plant_id IN (:...plantIds)', { plantIds: scopedPlantIds });
      }
    }

    const teamCountRaw = teamCountQb ? await teamCountQb.getRawOne<{ team_count: string | number }>() : null;

    const raw = await qb.getRawOne<Record<string, unknown>>();

    const hasTeamScope = teamIds.length > 0 && !canApproveAny && inchargeCategories.length === 0;

    return {
      tabs: {
        assigned: toNumber(raw?.assigned_count),
        raised: toNumber(raw?.raised_count),
        incharge: toNumber(raw?.incharge_count),
        team: toNumber(teamCountRaw?.team_count ?? 0),
        all: toNumber(raw?.total_count),
        approvalRequired: toNumber(raw?.approval_queue_count),
      },
      kpis: {
        open: toNumber(raw?.open_count),
        closedLast24h: toNumber(raw?.closed_last_24h_count),
        pendingApproval: toNumber(raw?.pending_approval_count),
        total: toNumber(raw?.total_count),
        escalated: toNumber(raw?.escalated_count),
      },
      defaultScope: canApproveAny ? 'all' : inchargeCategories.length > 0 ? 'incharge' : hasTeamScope ? 'team' : 'assigned',
    };
  }

  async getActivityTimeline(id: string, query: ListQuery, auth: AuthContext): Promise<ListResult<GenericRecord>> {
    await this.loadExistingWorkOrder(id, auth);

    const page = Math.max(1, Number(toScalar(query.page) || 1));
    const limit = Math.min(1000, Math.max(1, Number(toScalar(query.limit) || 50)));

    const qb = AppDataSource.createQueryBuilder()
      .select('log.*')
      .from('work_order_activity_logs', 'log')
      .where('log.work_order_id = :workOrderId', { workOrderId: id });

    const totalQb = qb.clone().select('COUNT(1)', 'count');
    qb.orderBy('log.occurred_at', 'DESC').offset((page - 1) * limit).limit(limit);

    const [items, totalRaw] = await Promise.all([
      qb.getRawMany<GenericRecord>(),
      totalQb.getRawOne<{ count: string | number }>(),
    ]);

    return { items, total: Number(totalRaw?.count ?? 0) };
  }

  private isAdminActor(auth: AuthContext): boolean {
    const roles = auth.roles.map((role) => String(role).toUpperCase());
    return roles.some((role) => ['ROOT_ADMIN', 'SUPER_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN', 'PLANT_ADMIN', 'MAINTENANCE_MANAGER'].includes(role));
  }

  private async isUserInAssignedTeam(workOrder: GenericRecord, userId: string, manager = AppDataSource.manager): Promise<boolean> {
    const plantId = workOrder.plant_id as string | null;
    const category = workOrder.category as string | null;
    const assetId = workOrder.asset_id as string | null;

    if (!plantId || !category || !assetId) {
      return false;
    }

    const asset = await manager.getRepository(AssetEntity).findOne({
      where: { id: assetId },
      select: ['departmentId'],
    });

    let categoryMapping = null;
    if (asset?.departmentId) {
      categoryMapping = await manager.getRepository(WorkOrderTeamMappingEntity).findOne({
        where: { plantId, departmentId: asset.departmentId, category },
        select: ['teamId'],
      });
    }
    if (!categoryMapping) {
      categoryMapping = await manager.getRepository(WorkOrderTeamMappingEntity).findOne({
        where: { plantId, departmentId: IsNull(), category },
        select: ['teamId'],
      });
    }

    if (!categoryMapping) {
      return false;
    }

    const team = await manager.getRepository(MaintenanceTeamEntity).findOne({
      where: { id: categoryMapping.teamId, isActive: true },
      select: ['teamLeaderId', 'teamMemberIds'],
    });

    if (!team) {
      return false;
    }

    const teamMemberIds = team.teamMemberIds ?? [];
    return team.teamLeaderId === userId || teamMemberIds.includes(userId);
  }

  private async canExecuteWorkOrder(existing: GenericRecord, auth: AuthContext, manager = AppDataSource.manager): Promise<boolean> {
    if (canAccessWorkOrder(auth, existing)) {
      return true;
    }
    return this.isUserInAssignedTeam(existing, auth.userId, manager);
  }

  private async ensureExecutionAccess(existing: GenericRecord, auth: AuthContext, manager = AppDataSource.manager) {
    if (await this.canExecuteWorkOrder(existing, auth, manager)) {
      return;
    }
    forbidden('Only the assigned technician or team members can perform this work order action');
  }

  private ensureApprovalAccess(existing: GenericRecord, auth: AuthContext): { isAdminOverride: boolean } {
    const raisedBy = typeof existing.raised_by === 'string' ? existing.raised_by : null;
    if (raisedBy && auth.userId === raisedBy) {
      return { isAdminOverride: false };
    }
    if (this.isAdminActor(auth)) {
      return { isAdminOverride: true };
    }
    forbidden('Only the work order raiser can review this work order');
  }

  private async loadExistingWorkOrder(
    id: string,
    auth: AuthContext,
    manager = AppDataSource.manager,
  ): Promise<GenericRecord> {
    const existing = await manager
      .createQueryBuilder()
      .select('t.*')
      .from('work_orders', 't')
      .where('t.id = :id', { id })
      .getRawOne<GenericRecord>();
    if (!existing) {
      badRequest('workorders record not found');
    }
    enforcePlantScope(auth, (existing.plant_id as string | null | undefined) ?? null);
    return existing;
  }

  private async writeActivityLog(
    workOrder: GenericRecord,
    auth: AuthContext,
    input: {
      eventType: string;
      notes?: string | null;
      safetyChecklist?: Record<string, unknown> | null;
      attachments?: Array<Record<string, unknown>> | null;
      eventMeta?: Record<string, unknown> | null;
      occurredAt?: string | null;
    },
    manager = AppDataSource.manager,
  ) {
    const repo = manager.getRepository(WorkOrderActivityLogEntity);
    await repo.save(
      repo.create({
        id: randomUUID(),
        workOrderId: String(workOrder.id),
        assetId: typeof workOrder.asset_id === 'string' ? workOrder.asset_id : null,
        plantId: typeof workOrder.plant_id === 'string' ? workOrder.plant_id : null,
        actorUserId: auth.userId,
        eventType: input.eventType,
        notes: input.notes ?? null,
        safetyChecklist: input.safetyChecklist ?? null,
        attachments: input.attachments ?? null,
        eventMeta: input.eventMeta ?? null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      }),
    );
  }

  private async createNotifications(
    notifications: Array<{
      userId: string;
      title: string;
      message: string;
      type: string;
      link?: string | null;
      woId?: string | null;
    }>,
    manager = AppDataSource.manager,
  ) {
    if (notifications.length === 0) {
      return;
    }
    const userIds = [...new Set(notifications.map((n) => n.userId))];
    const existingUsers = await manager.getRepository(UserEntity).find({
      where: { id: In(userIds) },
      select: ['id'],
    });
    const existingUserIds = new Set(existingUsers.map((u) => u.id));
    const validNotifications = notifications.filter((n) => existingUserIds.has(n.userId));
    if (validNotifications.length === 0) {
      return;
    }
    const repo = manager.getRepository(NotificationEntity);
    await repo.save(
      validNotifications.map((notification) =>
        repo.create({
          userId: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          link: notification.link ?? null,
          woId: notification.woId ?? null,
        }),
      ),
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
    const problemDescription = normalized.problem_description as string | undefined;
    if (!assetId || !problemDescription) {
      badRequest('asset_id and problem_description are required');
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

    // AUTO-MAPPING CATEGORY BASED ON ASSET
    const categoryFromAsset = asset.defaultCategory;
    const providedCategory = normalized.category as string | undefined;
    const finalCategory = providedCategory || categoryFromAsset || 'MECHANICAL';

    const normalizedCategory = await this.validateMasterOption(plantId, 'CATEGORY', finalCategory);
    
    const normalizedWorkOrderType = await this.validateMasterOption(
      plantId,
      'WO_TYPE',
      'BREAKDOWN',
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
    const initialStatus = assignedTeam?.teamLeaderId ? WORKFLOW_STATUSES.ASSIGNED : WORKFLOW_STATUSES.RAISED;
    
    // SLA Management: Set initial SLA due (e.g., 2 hours for breakdown)
    const slaMinutes = 120; // Default 2 hours
    const slaDueAt = new Date(Date.now() + slaMinutes * 60 * 1000);

    const payload: GenericRecord = {
      ...normalized,
      wo_number: woNumber || generateWorkOrderNumber(),
      category: normalizedCategory,
      wo_type: normalizedWorkOrderType,
      failure_code: null,
      sub_category: null,
      status: initialStatus,
      downtime_start_at: new Date().toISOString(),
      raised_by: normalized.raised_by ?? auth.userId,
      assigned_to: normalized.assigned_to ?? assignedTeam?.teamLeaderId ?? null,
      plant_id: plantId,
      plantId,
      sla_due_at: slaDueAt.toISOString(),
      escalation_level: 0,
      shift: normalized.shift || null,
      breakdown_type: normalized.breakdown_type || null,
    };

    const createdWorkOrder = await super.create(payload, auth);

    const manuallyAssigned: (string | null)[] = createdWorkOrder.assigned_to ? [String(createdWorkOrder.assigned_to)] : [];
    const teamAssigned: (string | null)[] = assignedTeam ? [assignedTeam.teamLeaderId, ...(assignedTeam.teamMemberIds ?? [])] : [];
    const recipientIds = uniqueIds([...manuallyAssigned, ...teamAssigned]);

    if (recipientIds.length > 0) {
      const machineCode = String(asset.code ?? '').trim();
      const machineName = String(asset.name ?? '').trim();
      const hasAttachments = parseJsonArray(payload.attachments).length > 0;
      const assignedName = assignedTeam ? assignedTeam.teamName : 'an engineer';

      const notificationMessage = [
        `${String(createdWorkOrder.wo_number ?? payload.wo_number)} assigned to ${assignedName}.`,
        `Priority: ${String(payload.priority ?? 'MEDIUM')}.`,
        machineCode || machineName ? `Machine: ${[machineCode, machineName].filter(Boolean).join(' - ')}.` : null,
        hasAttachments ? 'Attachments: Yes.' : null,
      ]
        .filter(Boolean)
        .join(' ');

      const notifications = recipientIds.map((userId) => ({
        userId,
        title: 'New Work Order Assigned',
        message: notificationMessage,
        type: 'warning',
        link: '/work-orders',
        woId: String(createdWorkOrder.id),
      }));
      
      await this.createNotifications(notifications);
    }

    await this.writeActivityLog(
      createdWorkOrder,
      auth,
      {
        eventType: initialStatus,
        notes: normalizeText(problemDescription),
        attachments: parseJsonArray(payload.attachments),
        occurredAt: new Date().toISOString(),
      },
    );

    await notifyBreakdownWorkOrderRaised(String(createdWorkOrder.id));

    if (await isMailConfigured()) {
      const woData = {
        woId: String(createdWorkOrder.id),
        woNumber: String(createdWorkOrder.wo_number ?? payload.wo_number),
        category: String(payload.category ?? createdWorkOrder.category ?? 'MECHANICAL'),
        assetId: typeof payload.asset_id === 'string' ? payload.asset_id : (typeof createdWorkOrder.asset_id === 'string' ? createdWorkOrder.asset_id : undefined),
        plantId: typeof payload.plant_id === 'string' ? payload.plant_id : undefined,
        priority: String(payload.priority ?? 'MEDIUM'),
        problemDescription: String(payload.problem_description ?? ''),
        location: String(asset.location ?? ''),
        assignedTeamId: assignedTeam?.id,
        createdTime: new Date().toLocaleString(),
      };

      sendNewWorkOrderEmails(woData, payload.raised_by as string | null | undefined).catch(() => {});

      if (assignedTeam) {
        sendWorkOrderAssignedEmails(woData, assignedTeam.id).catch(() => {});
      }
    }

    return createdWorkOrder;
  }

  private async persistWorkOrderUpdate(
    id: string,
    input: GenericRecord,
    auth: AuthContext,
    options?: { manager?: typeof AppDataSource.manager; allowWorkflowMutation?: boolean; existing?: GenericRecord },
  ): Promise<GenericRecord> {
    const manager = options?.manager ?? AppDataSource.manager;
    const existing = options?.existing ?? (await this.loadExistingWorkOrder(id, auth, manager));
    const normalized = normalizeKeys(input);

    if (!options?.allowWorkflowMutation && hasAnyWorkflowManagedField(normalized)) {
      badRequest('Use the dedicated work order workflow actions for status and approval changes');
    }

    const nextAssetId = (normalized.asset_id as string | undefined) ?? (existing.asset_id as string);
    const asset = await manager.getRepository(AssetEntity).findOneBy({ id: nextAssetId, isActive: true });
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
      previousStatus === WORKFLOW_STATUSES.CLOSED ? previousUsage : [],
      nextStatus === WORKFLOW_STATUSES.CLOSED ? nextUsage : [],
      { plantId, assetId: nextAssetId },
    );

    const payload: GenericRecord = {
      ...normalized,
      asset_id: nextAssetId,
      plant_id: plantId,
      ...(normalized.status === WORKFLOW_STATUSES.ACCEPTED && !existing.accepted_at ? { accepted_at: new Date().toISOString() } : {}),
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

    const updated = await manager
      .createQueryBuilder()
      .select('t.*')
      .from('work_orders', 't')
      .where('t.id = :id', { id })
      .getRawOne<GenericRecord>();
    return updated as GenericRecord;
  }

  async acceptWorkOrder(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await this.loadExistingWorkOrder(id, auth, manager);
      const status = String(existing.status ?? '').toUpperCase();
      const allowedStatuses: string[] = [WORKFLOW_STATUSES.RAISED, WORKFLOW_STATUSES.TRIAGED, WORKFLOW_STATUSES.ASSIGNED];
      if (!allowedStatuses.includes(status)) {
        conflict('Only raised, triaged, or assigned work orders can be accepted');
      }

      await this.ensureExecutionAccess(existing, auth, manager);

      const normalized = normalizeKeys(input);
      const now = new Date().toISOString();
      const notes = normalizeText(normalized.notes);
      const updated = await this.persistWorkOrderUpdate(
        id,
        {
          status: WORKFLOW_STATUSES.ACCEPTED,
          opened_at: existing.opened_at ?? now,
          accepted_at: now,
          assigned_to: normalizeText(existing.assigned_to) ?? auth.userId,
        },
        auth,
        { manager, allowWorkflowMutation: true, existing },
      );

      await this.writeActivityLog(
        updated,
        auth,
        {
          eventType: 'ACCEPTED',
          notes,
          occurredAt: now,
        },
        manager,
      );

      const raisedBy = normalizeText(existing.raised_by);
      if (raisedBy && raisedBy !== auth.userId) {
        await this.createNotifications(
          [
            {
              userId: raisedBy,
              title: 'Work Order Accepted',
              message: `${String(existing.wo_number)} has been accepted and is queued for execution.`,
              type: 'info',
              link: '/work-orders',
              woId: String(existing.id),
            },
          ],
          manager,
        );
      }
      return updated;
    });
  }

  async startWorkOrder(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await this.loadExistingWorkOrder(id, auth, manager);
      const status = String(existing.status ?? '').toUpperCase();
      const allowedStartStatuses: string[] = [
        WORKFLOW_STATUSES.RAISED,
        WORKFLOW_STATUSES.TRIAGED,
        WORKFLOW_STATUSES.ASSIGNED,
        WORKFLOW_STATUSES.ACCEPTED,
        WORKFLOW_STATUSES.OPENED,
        WORKFLOW_STATUSES.REASSIGNED,
      ];
      if (!allowedStartStatuses.includes(status)) {
        conflict('Work order can only be started from Raised, Triaged, Assigned, Accepted, Opened, or Reassigned status');
      }

      await this.ensureExecutionAccess(existing, auth, manager);

      const normalized = normalizeKeys(input);
      const verificationMethod = toUpperText(normalized.verification_method);
      if (!verificationMethod || !['QR_SCAN', 'MANUAL_ENTRY'].includes(verificationMethod)) {
        badRequest('verification_method must be QR_SCAN or MANUAL_ENTRY');
      }

      const asset = await manager.getRepository(AssetEntity).findOneBy({
        id: String(existing.asset_id),
        isActive: true,
      });
      if (!asset) {
        badRequest('Assigned machine is not active');
      }

      const scannedAssetId = normalizeText(normalized.scanned_asset_id);
      const manualMachineCode = normalizeText(normalized.manual_machine_code);
      if (verificationMethod === 'QR_SCAN') {
        if (!scannedAssetId || scannedAssetId !== existing.asset_id) {
          badRequest('Scanned QR does not match the assigned machine');
        }
      }
      if (verificationMethod === 'MANUAL_ENTRY') {
        if (!manualMachineCode) {
          badRequest('manual_machine_code is required when QR is unavailable');
        }
        if (manualMachineCode.toUpperCase() !== String(asset.code ?? '').trim().toUpperCase()) {
          badRequest('Manual machine code does not match the assigned machine');
        }
      }

      // CATEGORY REASSIGNMENT LOGIC
      const newCategory = normalizeText(normalized.category);
      if (newCategory && newCategory !== existing.category) {
        return this.reassignWorkOrderInternal(manager, id, newCategory, normalized, auth);
      }

      const safetyChecklist = normalizeKeys((normalized.safety_checklist as GenericRecord | undefined) ?? {});
      if (!safetyChecklist.ppe_worn || !safetyChecklist.machine_isolated || !safetyChecklist.safety_lock_applied) {
        badRequest('All safety checklist items must be confirmed before work starts');
      }

      const nowDate = new Date();
      const now = nowDate.toISOString();
      const estimatedMinutes = Number.isFinite(Number(normalized.estimated_time_minutes))
        ? Math.max(0, Math.round(Number(normalized.estimated_time_minutes)))
        : null;
      const expectedDowntimeMinutes = Number.isFinite(Number(normalized.expected_downtime_minutes))
        ? Math.max(0, Math.round(Number(normalized.expected_downtime_minutes)))
        : estimatedMinutes;
      const expectedCompletionAt =
        expectedDowntimeMinutes && expectedDowntimeMinutes > 0
          ? new Date(nowDate.getTime() + expectedDowntimeMinutes * 60 * 1000).toISOString()
          : parseDateTime(normalized.expected_completion_at);
      const assignedTechnician = normalizeText(normalized.assigned_to) ?? auth.userId;

      const technicianVerification = {
        ...(parseJsonObject(existing.technician_verification) ?? {}),
        verified_at: now,
        verification_method: verificationMethod,
        initial_assessment: normalizeText(normalized.initial_assessment),
        assigned_to_notes: normalizeText(normalized.assigned_to_notes),
        assessment_remarks: normalizeText(normalized.assessment_remarks),
        estimated_time_minutes: estimatedMinutes,
        expected_downtime_minutes: expectedDowntimeMinutes,
        expected_completion_at: expectedCompletionAt,
        work_permit_required: Boolean(normalized.work_permit_required),
        loto_required: Boolean(normalized.loto_required),
        ...(verificationMethod === 'QR_SCAN' ? { scanned_asset_id: scannedAssetId } : {}),
        ...(verificationMethod === 'MANUAL_ENTRY' ? { manual_machine_code: manualMachineCode } : {}),
      };

      const updated = await this.persistWorkOrderUpdate(
        id,
        {
          status: WORKFLOW_STATUSES.IN_PROGRESS,
          opened_at: existing.opened_at ?? now,
          started_at: existing.started_at ?? now,
          downtime_start_at: existing.downtime_start_at ?? now,
          accepted_at: existing.accepted_at ?? now,
          assigned_to: assignedTechnician,
          technician_verification: technicianVerification,
          initial_assessment: normalizeText(normalized.initial_assessment),
          expected_completion_at: expectedCompletionAt ? new Date(expectedCompletionAt) : null,
          work_permit_required: Boolean(normalized.work_permit_required),
          loto_required: Boolean(normalized.loto_required),
          remarks: normalizeText(normalized.assessment_remarks) ?? existing.remarks ?? null,
          safety_checklist: {
            ...safetyChecklist,
            confirmed_at: now,
          },
        },
        auth,
        { manager, allowWorkflowMutation: true, existing },
      );

      await this.writeActivityLog(
        updated,
        auth,
        {
          eventType: 'WORK_STARTED',
          notes: normalizeText(normalized.initial_assessment),
          safetyChecklist: parseJsonObject(updated.safety_checklist),
          eventMeta: {
            verificationMethod,
            assignedToNotes: normalizeText(normalized.assigned_to_notes),
            estimatedTimeMinutes: technicianVerification.estimated_time_minutes,
            workPermitRequired: technicianVerification.work_permit_required,
            lotoRequired: technicianVerification.loto_required,
          },
          occurredAt: now,
        },
        manager,
      );

      const raisedBy = normalizeText(existing.raised_by);
      if (raisedBy && raisedBy !== auth.userId) {
        await this.createNotifications(
          [
            {
              userId: raisedBy,
              title: 'Work Order In Progress',
              message: `${String(existing.wo_number)} is now in progress.`,
              type: 'info',
              link: '/work-orders',
              woId: String(existing.id),
            },
          ],
          manager,
        );
      }

      return updated;
    });
  }

  async triageWorkOrder(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await this.loadExistingWorkOrder(id, auth, manager);
      const status = String(existing.status ?? '').toUpperCase();
      const allowedTriageStatuses: string[] = [
        WORKFLOW_STATUSES.RAISED,
        WORKFLOW_STATUSES.ASSIGNED,
        WORKFLOW_STATUSES.OPENED,
        WORKFLOW_STATUSES.TRIAGED,
      ];
      if (!allowedTriageStatuses.includes(status)) {
        conflict('Only raised or assigned work orders can be triaged');
      }

      await this.ensureExecutionAccess(existing, auth, manager);

      const normalized = normalizeKeys(input);
      const now = new Date().toISOString();
      const technicianVerification = {
        ...(parseJsonObject(existing.technician_verification) ?? {}),
        triaged_at: now,
        initial_assessment: normalizeText(normalized.initial_assessment),
        assigned_to_notes: normalizeText(normalized.assigned_to_notes),
        estimated_time_minutes: Number.isFinite(Number(normalized.estimated_time_minutes))
          ? Math.max(0, Math.round(Number(normalized.estimated_time_minutes)))
          : null,
      };

      const nextStatus = normalizeText(existing.assigned_to) ? WORKFLOW_STATUSES.ASSIGNED : WORKFLOW_STATUSES.TRIAGED;
      const updated = await this.persistWorkOrderUpdate(
        id,
        {
          status: nextStatus,
          opened_at: existing.opened_at ?? now,
          technician_verification: technicianVerification,
        },
        auth,
        { manager, allowWorkflowMutation: true, existing },
      );

      await this.writeActivityLog(
        updated,
        auth,
        {
          eventType: 'TRIAGED',
          notes: normalizeText(normalized.initial_assessment),
          eventMeta: {
            assignedToNotes: normalizeText(normalized.assigned_to_notes),
            estimatedTimeMinutes: technicianVerification.estimated_time_minutes,
            postTriageStatus: nextStatus,
          },
          occurredAt: now,
        },
        manager,
      );

      const raisedBy = normalizeText(existing.raised_by);
      if (raisedBy && raisedBy !== auth.userId) {
        await this.createNotifications(
          [
            {
              userId: raisedBy,
              title: 'Work Order Triaged',
              message: `${String(existing.wo_number)} was triaged and is ready for execution.`,
              type: 'info',
              link: '/work-orders',
              woId: String(existing.id),
            },
          ],
          manager,
        );
      }

      return updated;
    });
  }

  private async reassignWorkOrderInternal(
    manager: any,
    id: string,
    newCategory: string,
    input: GenericRecord,
    auth: AuthContext,
  ): Promise<GenericRecord> {
    const existing = await this.loadExistingWorkOrder(id, auth, manager);
    const plantId = String(existing.plant_id);
    const asset = await manager.getRepository(AssetEntity).findOneBy({ id: existing.asset_id });
    
    const normalizedCategory = await this.validateMasterOption(plantId, 'CATEGORY', newCategory);
    
    let categoryMapping = null;
    if (plantId && asset?.departmentId) {
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

    const now = new Date().toISOString();
    const updated = await this.persistWorkOrderUpdate(
      id,
      {
        category: normalizedCategory,
        status: WORKFLOW_STATUSES.REASSIGNED,
        assigned_to: assignedTeam?.teamLeaderId ?? null,
        initial_assessment: normalizeText(input.initial_assessment),
        started_at: null,
        opened_at: null,
        accepted_at: null,
        technician_verification: null,
        safety_checklist: null,
        remarks: `Reassigned from ${existing.category} to ${normalizedCategory}. Reason: ${normalizeText(input.assessment_remarks ?? input.remarks) || 'Category mismatch during assessment'}`,
      },
      auth,
      { manager, allowWorkflowMutation: true, existing },
    );

    await this.writeActivityLog(
      updated,
      auth,
      {
        eventType: 'REASSIGNED',
        notes: `Reassigned to ${normalizedCategory}. Initial assessment: ${normalizeText(input.initial_assessment)}`,
        eventMeta: {
          previousCategory: existing.category,
          newCategory: normalizedCategory,
          newTeamId: assignedTeam?.id || null,
        },
        occurredAt: now,
      },
      manager,
    );

    if (assignedTeam) {
       const recipientIds = uniqueIds([assignedTeam.teamLeaderId, ...(assignedTeam.teamMemberIds ?? [])]);
       await this.createNotifications(
         recipientIds.map(userId => ({
           userId,
           title: 'Work Order Reassigned to Your Team',
           message: `${String(existing.wo_number)} has been reassigned to ${assignedTeam.teamName}.`,
           type: 'warning',
           link: '/work-orders',
           woId: String(existing.id),
         })),
         manager
       );
    }

    return updated;
  }

  async addActivity(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await this.loadExistingWorkOrder(id, auth, manager);
      await this.ensureExecutionAccess(existing, auth, manager);

      const normalized = normalizeKeys(input);
      const type = String(normalized.type ?? 'COMMENT').toUpperCase();
      const notes = normalizeText(normalized.notes);
      if (!notes) {
        badRequest('notes are required');
      }

      const attachments = parseJsonArray(normalized.attachments);
      const occurredAt = normalizeText(normalized.occurred_at) ?? new Date().toISOString();
      const eventType = type === 'INTERNAL_NOTE' ? 'INTERNAL_NOTE' : 'COMMENT';

      await this.writeActivityLog(
        existing,
        auth,
        {
          eventType,
          notes,
          attachments,
          occurredAt,
        },
        manager,
      );

      if (eventType === 'COMMENT') {
        const recipientIds = uniqueIds([
          normalizeText(existing.assigned_to),
          normalizeText(existing.raised_by),
        ]).filter((userId) => userId !== auth.userId);
        await this.createNotifications(
          recipientIds.map((userId) => ({
            userId,
            title: 'Work Order Update',
            message: `${String(existing.wo_number)} has a new comment.`,
            type: 'info',
            link: '/work-orders',
            woId: String(existing.id),
          })),
          manager,
        );
      }

      return existing;
    });
  }

  async submitForApproval(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await this.loadExistingWorkOrder(id, auth, manager);
      const status = String(existing.status ?? '').toUpperCase();
      if (status !== WORKFLOW_STATUSES.IN_PROGRESS && status !== WORKFLOW_STATUSES.REJECTED && status !== WORKFLOW_STATUSES.ASSIGNED) {
        conflict('Only in-progress or reopened work orders can be completed for user verification');
      }

      await this.ensureExecutionAccess(existing, auth, manager);

      const normalized = normalizeKeys(input);
      const issueDetails = normalizeText(normalized.issue_details) ?? normalizeText(normalized.root_cause);
      const workPerformed = normalizeText(normalized.work_performed_description) ?? normalizeText(normalized.action_taken);
      const correctiveAction = normalizeText(normalized.corrective_action) ?? workPerformed;
      const remarks = normalizeText(normalized.remarks);
      const partsReplaced = normalizeText(normalized.parts_replaced) ?? normalizeText(normalized.materials_used);
      const completionAt = parseDateTime(normalized.completion_at) ?? new Date();
      const nowDate = completionAt;
      const now = nowDate.toISOString();
      
      const laborMinutes = Number.isFinite(Number(normalized.time_spent_minutes ?? normalized.labor_minutes))
        ? Math.max(0, Math.round(Number(normalized.time_spent_minutes ?? normalized.labor_minutes)))
        : elapsedMinutes(existing.started_at, nowDate);
      
      const downtimeMinutes = Number.isFinite(Number(normalized.downtime_minutes))
        ? Math.max(0, Math.round(Number(normalized.downtime_minutes)))
        : elapsedMinutes(existing.downtime_start_at ?? existing.started_at, nowDate);

      const whyWhyAnalysis =
        downtimeMinutes > 120 ? validateWhyWhyAnalysis(normalized.why_why_analysis) : parseJsonObject(normalized.why_why_analysis);

      const actualCost = Number.isFinite(Number(normalized.actual_cost)) ? Math.max(0, Number(normalized.actual_cost)) : 0;
      const attachments = parseJsonArray(normalized.attachments);
      const spareConsumption = normalized.spare_consumption !== undefined ? normalizeSpareUsage(normalized.spare_consumption) : [];
      const spareUsed = Boolean(normalized.spare_used);
      const hasMaterials = Boolean(partsReplaced) || spareConsumption.length > 0 || spareUsed === false;
      const operatorFault = Boolean(normalized.operator_fault);
      const followUpRequired = Boolean(normalized.follow_up_required);
      
      if (!issueDetails || !workPerformed || !remarks || !correctiveAction) {
        badRequest('issue_details, work_performed_description, corrective_action, and remarks are required');
      }

      if (spareUsed && spareConsumption.length === 0 && !partsReplaced) {
        badRequest('Provide structured spare usage or materials used when spares were consumed');
      }

      const requestedWoType = normalizeText(normalized.wo_type) ?? String(existing.wo_type ?? 'BREAKDOWN');
      const plantId = String(existing.plant_id ?? '');
      const normalizedWorkOrderType = await this.validateMasterOption(plantId, 'WO_TYPE', requestedWoType);
      const normalizedFailureCode = await this.validateMasterOption(
        plantId,
        'FAILURE_CODE',
        (normalized.failure_code as string | null | undefined) ?? null,
      );
      const normalizedActualFailureCategory = await this.validateMasterOption(
        plantId,
        'CATEGORY',
        (normalized.actual_failure_category as string | null | undefined) ?? null,
      );

      const workOrderType = normalizeWorkOrderMasterCode(String(normalizedWorkOrderType ?? existing.wo_type ?? 'BREAKDOWN'));
      const isFailureEvent = workOrderType === 'BREAKDOWN' && !operatorFault;

      const mergedAttachments = [
        ...parseJsonArray(existing.attachments),
        ...attachments,
      ];

      const updateData: GenericRecord = {
        status: followUpRequired ? WORKFLOW_STATUSES.IN_PROGRESS : WORKFLOW_STATUSES.APPROVAL_PENDING,
        wo_type: workOrderType,
        resolved_at: now,
        downtime_end_at: now,
        root_cause: issueDetails,
        action_taken: correctiveAction,
        downtime_minutes: downtimeMinutes,
        is_failure_event: isFailureEvent,
        failure_code: normalizedFailureCode,
        actual_failure_category: normalizedActualFailureCategory,
        why_why_analysis: whyWhyAnalysis,
        preventive_recommendation: normalizeText(normalized.preventive_recommendation),
        manpower_used: normalizeText(normalized.manpower_used),
        labor_hours: minutesToLaborHours(laborMinutes),
        actual_cost: actualCost,
        parts_replaced: partsReplaced ?? formatSpareUsageSummary(spareConsumption),
        spare_consumption: spareConsumption,
        operator_fault: operatorFault,
        warranty_claim: false,
        follow_up_required: followUpRequired,
        remarks,
        attachments: mergedAttachments,
      };
      if (!followUpRequired) {
        updateData.submitted_for_approval_at = now;
        updateData.submitted_for_approval_by = auth.userId;
      }
      const updated = await this.persistWorkOrderUpdate(
        id,
        updateData,
        auth,
        { manager, allowWorkflowMutation: true, existing },
      );

      // SPAWN LINKED FOLLOW-UP WORK ORDER IF REQUIRED
      if (followUpRequired) {
        const followUpTeamId = normalizeText(normalized.follow_up_team_id);
        const followUpTeam = followUpTeamId ? await manager.getRepository(MaintenanceTeamEntity).findOne({
          where: { id: followUpTeamId, isActive: true },
          select: ['id', 'teamLeaderId', 'teamName']
        }) : null;

        if (followUpTeam) {
          const followUpPayload = {
            asset_id: existing.asset_id,
            category: normalizeText(normalized.follow_up_support_category) || 'MECHANICAL',
            priority: existing.priority,
            problem_description: `FOLLOW-UP SUPPORT for ${existing.wo_number}: ${normalizeText(normalized.follow_up_notes) || 'Additional work required'}`,
            wo_type: 'SUPPORT',
            parent_work_order_id: id,
            plant_id: existing.plant_id,
            assigned_to: followUpTeam.teamLeaderId || null,
          };
          await this.create(followUpPayload, auth);
        }
      }

      await this.writeActivityLog(
        updated,
        auth,
        {
          eventType: 'USER_VERIFICATION_REQUESTED',
          notes: remarks,
          attachments,
          eventMeta: {
            issueDetails,
            workPerformed,
            laborMinutes,
            downtimeMinutes,
            followUpSpawned: followUpRequired,
            isFailureEvent,
          },
          occurredAt: now,
        },
        manager,
      );

      const raisedBy = normalizeText(existing.raised_by);
      if (raisedBy) {
        await this.createNotifications(
          [
            {
              userId: raisedBy,
              title: 'Work Order Pending Approval',
              message: `${String(existing.wo_number)} is waiting for your approval to close.`,
              type: 'warning',
              link: '/work-orders',
              woId: String(existing.id),
            },
          ],
          manager,
        );
      }

      if ((await isMailConfigured()) && !followUpRequired) {
        sendWorkOrderCompletedEmails(
          {
            woId: String(existing.id),
            woNumber: String(existing.wo_number),
            category: String(existing.category ?? 'MECHANICAL'),
            assetId: String(existing.asset_id ?? ''),
            plantId: String(existing.plant_id ?? ''),
            priority: String(existing.priority ?? 'MEDIUM'),
            problemDescription: String(existing.problem_description ?? ''),
            location: String(existing.reported_location ?? ''),
          },
          existing.raised_by as string | null | undefined,
          existing.assigned_to as string | null | undefined,
        ).catch(() => {});
      }

      return updated;
    });
  }

  async approveWorkOrder(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await this.loadExistingWorkOrder(id, auth, manager);
      const status = String(existing.status ?? '').toUpperCase();
      if (!isPendingApprovalStatus(status)) {
        conflict('Only work orders pending requester approval can be closed');
      }

      const { isAdminOverride } = this.ensureApprovalAccess(existing, auth);
      const normalized = normalizeKeys(input);
      const comments = normalizeText(normalized.comments);
      if (isAdminOverride && !comments) {
        badRequest('Admin override approval requires comments for the audit trail');
      }

      const now = new Date().toISOString();
      const updated = await this.persistWorkOrderUpdate(
        id,
        {
          status: WORKFLOW_STATUSES.CLOSED,
          closed_at: now,
          approved_by: auth.userId,
          approved_at: now,
          rejected_by: null,
          rejected_at: null,
          approval_comments: comments,
          admin_override_by: isAdminOverride ? auth.userId : null,
          admin_override_at: isAdminOverride ? now : null,
          admin_override_reason: isAdminOverride ? comments : null,
        },
        auth,
        { manager, allowWorkflowMutation: true, existing },
      );

      await this.writeActivityLog(
        updated,
        auth,
        {
          eventType: isAdminOverride ? 'ADMIN_FORCE_CLOSED' : 'USER_CONFIRMED_CLOSE',
          notes: comments,
          eventMeta: {
            reviewedByRaiser: !isAdminOverride,
          },
          occurredAt: now,
        },
        manager,
      );

      const recipients = uniqueIds([
        normalizeText(existing.assigned_to),
        isAdminOverride ? normalizeText(existing.raised_by) : null,
      ]).filter((userId) => userId !== auth.userId);
      await this.createNotifications(
        recipients.map((userId) => ({
          userId,
          title: 'Work Order Closed',
          message: `${String(existing.wo_number)} has been closed${isAdminOverride ? ' by admin override' : ''}.`,
          type: 'success',
          link: '/work-orders',
          woId: String(existing.id),
        })),
        manager,
      );

      if (await isMailConfigured()) {
        sendWorkOrderClosedEmails(
          {
            woId: String(existing.id),
            woNumber: String(existing.wo_number),
            category: String(existing.category ?? 'MECHANICAL'),
            assetId: String(existing.asset_id ?? ''),
            plantId: String(existing.plant_id ?? ''),
            priority: String(existing.priority ?? 'MEDIUM'),
            problemDescription: String(existing.problem_description ?? ''),
            location: String(existing.reported_location ?? ''),
          },
          existing.raised_by as string | null | undefined,
          existing.assigned_to as string | null | undefined,
        ).catch(() => {});
      }

      // PHASE 1 & 2: AUTOMATIC MAINTENANCE REPORT GENERATION
      try {
        await AnalyticsService.generateMaintenanceReport(updated.id as string, manager);
      } catch (reportError) {
        console.error('Failed to generate automatic maintenance report:', reportError);
      }

      return updated;
    });
  }

  async rejectWorkOrder(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => {
      const existing = await this.loadExistingWorkOrder(id, auth, manager);
      const status = String(existing.status ?? '').toUpperCase();
      if (!isPendingApprovalStatus(status)) {
        conflict('Only work orders pending requester approval can be reopened');
      }

      const { isAdminOverride } = this.ensureApprovalAccess(existing, auth);
      const normalized = normalizeKeys(input);
      const comments = normalizeText(normalized.comments);
      if (!comments) {
        badRequest('comments are required when rejecting a work order');
      }

      const now = new Date().toISOString();
      const updated = await this.persistWorkOrderUpdate(
        id,
        {
          status: WORKFLOW_STATUSES.REJECTED,
          started_at: null,
          closed_at: null,
          approved_by: null,
          approved_at: null,
          resolved_at: null,
          rejected_by: auth.userId,
          rejected_at: now,
          approval_comments: comments,
          submitted_for_approval_at: null,
          submitted_for_approval_by: null,
          admin_override_by: isAdminOverride ? auth.userId : null,
          admin_override_at: isAdminOverride ? now : null,
          admin_override_reason: isAdminOverride ? comments : null,
        },
        auth,
        { manager, allowWorkflowMutation: true, existing },
      );

      await this.writeActivityLog(
        updated,
        auth,
        {
          eventType: isAdminOverride ? 'ADMIN_REOPENED' : 'USER_REOPENED',
          notes: comments,
          occurredAt: now,
        },
        manager,
      );

      const recipients = uniqueIds([
        normalizeText(existing.assigned_to),
        isAdminOverride ? normalizeText(existing.raised_by) : null,
      ]).filter((userId) => userId !== auth.userId);
      await this.createNotifications(
        recipients.map((userId) => ({
          userId,
          title: 'Work Order Reopened',
          message: `${String(existing.wo_number)} was reopened. Comments: ${comments}`,
          type: 'critical',
          link: '/work-orders',
          woId: String(existing.id),
        })),
        manager,
      );

      if (await isMailConfigured()) {
        sendWorkOrderRejectedEmails(
          {
            woId: String(existing.id),
            woNumber: String(existing.wo_number),
            category: String(existing.category ?? 'MECHANICAL'),
            assetId: String(existing.asset_id ?? ''),
            plantId: String(existing.plant_id ?? ''),
            priority: String(existing.priority ?? 'MEDIUM'),
            problemDescription: String(existing.problem_description ?? ''),
            location: String(existing.reported_location ?? ''),
          },
          existing.assigned_to as string | null | undefined,
        ).catch(() => {});
      }

      return updated;
    });
  }

  async cancelWorkOrder(_id: string, _input: { reason: string }, _auth: AuthContext): Promise<GenericRecord> {
    forbidden('Work order cancellation has been removed from the maintenance workflow');
  }

  async update(id: string, input: GenericRecord, auth: AuthContext): Promise<GenericRecord> {
    return AppDataSource.transaction(async (manager) => this.persistWorkOrderUpdate(id, input, auth, { manager }));
  }

  async bulkUpdate(ids: string[], input: GenericRecord, auth: AuthContext): Promise<{ updated: number }> {
    const normalized = normalizeKeys(input);
    // Only allow updating certain fields in bulk
    const allowedBulkFields = new Set([
      'assigned_to',
      'priority',
      'status',
      'category',
      'wo_type',
      'plant_id',
      'remarks',
    ]);
    
    const payload: GenericRecord = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (allowedBulkFields.has(key) && value !== undefined) {
        payload[key] = value;
      }
    }

    if (Object.keys(payload).length === 0) {
      badRequest('No valid fields provided for bulk update. Allowed: assigned_to, priority, status, category, wo_type, plant_id, remarks');
    }

    // Validate each work order exists and user has access
    const validIds: string[] = [];
    for (const id of ids) {
      try {
        await this.loadExistingWorkOrder(id, auth);
        validIds.push(id);
      } catch {
        // Skip IDs that fail access check
        continue;
      }
    }

    if (validIds.length === 0) {
      badRequest('None of the selected work orders are accessible');
    }

    if (payload.status) {
      const newStatus = String(payload.status).toUpperCase();
      const bulkSafeStatuses = new Set(['ASSIGNED', 'OPENED', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']);
      if (!bulkSafeStatuses.has(newStatus)) {
        badRequest('Status not allowed for bulk update. Allowed: ASSIGNED, OPENED, IN_PROGRESS, CLOSED, CANCELLED');
      }
      payload.status = newStatus;
      if (newStatus === 'CLOSED') {
        payload.closed_at = new Date().toISOString();
      }
    }

    const sanitizedPayload = toEntityPayload(sanitizePayload(payload));
    if (Object.keys(sanitizedPayload).length === 0) {
      return { updated: 0 };
    }

    await AppDataSource.createQueryBuilder()
      .update('work_orders')
      .set(sanitizedPayload as never)
      .where('id IN (:...ids)', { ids: validIds })
      .execute();

    // Log activity for each
    for (const id of validIds) {
      await this.writeActivityLog(
        { id, plant_id: payload.plant_id || null, asset_id: null },
        auth,
        {
          eventType: 'BULK_UPDATE',
          notes: `Bulk updated: ${Object.keys(payload).join(', ')}`,
          eventMeta: { ...payload, bulkAction: true },
          occurredAt: new Date().toISOString(),
        },
      );
    }

    return { updated: validIds.length };
  }

  async exportCSV(query: ListQuery, auth: AuthContext): Promise<string> {
    // Get all matching records (up to 10000 for export)
    const exportQuery = { ...query, page: 1, limit: 10000 };
    const result = await this.list(exportQuery, auth);
    
    const headers = [
      'WO Number', 'Status', 'Priority', 'Category', 'Type',
      'Asset Code', 'Asset Name',
      'Problem Description', 'Root Cause', 'Action Taken',
      'Raised By', 'Assigned To',
      'Created At', 'Started At', 'Resolved At', 'Closed At',
      'Downtime (mins)', 'Labor Hours', 'Actual Cost',
      'Location', 'Failure Code', 'Shift',
      'Safety Related', 'Operator Fault', 'Follow Up Required',
      'Remarks',
    ];

    const csvRows = [headers.join(',')];

    for (const item of result.items) {
      const assets = item.assets as { code?: string; name?: string } | null;
      const row = [
        String(item.wo_number || ''),
        String(item.status || ''),
        String(item.priority || ''),
        String(item.category || ''),
        String(item.wo_type || ''),
        assets?.code || '',
        assets?.name || '',
        escapeCsvField(String(item.problem_description || '')),
        escapeCsvField(String(item.root_cause || '')),
        escapeCsvField(String(item.action_taken || '')),
        String(item.raised_by || ''),
        String(item.assigned_to || ''),
        item.created_at ? new Date(String(item.created_at)).toISOString().split('T')[0] : '',
        item.started_at ? new Date(String(item.started_at)).toISOString().split('T')[0] : '',
        item.resolved_at ? new Date(String(item.resolved_at)).toISOString().split('T')[0] : '',
        item.closed_at ? new Date(String(item.closed_at)).toISOString().split('T')[0] : '',
        String(item.downtime_minutes || ''),
        String(item.labor_hours || ''),
        String(item.actual_cost || ''),
        escapeCsvField(String(item.reported_location || '')),
        String(item.failure_code || ''),
        String(item.shift || ''),
        item.safety_related ? 'Yes' : 'No',
        item.operator_fault ? 'Yes' : 'No',
        item.follow_up_required ? 'Yes' : 'No',
        escapeCsvField(String(item.remarks || '')),
      ];
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }

}

export const workordersService = new WorkOrdersService();
