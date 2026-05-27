import { randomBytes, randomUUID } from 'crypto';
import { Router } from 'express';
import { Brackets, SelectQueryBuilder } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import {
  GateEntity,
  GateEntryEntity,
  GateEntryTypeEntity,
  GateExitLogEntity,
  GateMaterialEntryEntity,
  GateTemplateFieldEntity,
  GateTemplateUserEntity,
  GateVehicleEntryEntity,
  GhgTransportLogEntity,
  PlantEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { toCsv } from '../../utils/csvExport';
import { createSimpleExcelWorkbook } from '../../utils/excel';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { createSimplePdf } from '../../utils/pdf';
import { getReportBranding } from '../../utils/reportBranding';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';
import { APP_NAME } from '../../config/branding';

const gateTypeValues = ['MAIN_GATE', 'MATERIAL_GATE', 'STAFF_GATE', 'DISPATCH_GATE', 'VISITOR_GATE', 'EMPLOYEE_GATE'] as const;
const fieldTypeValues = ['TEXT', 'DROPDOWN', 'NUMBER', 'DATE', 'TIME', 'PHOTO', 'DOCUMENT', 'TEXTAREA', 'VEHICLE_NUMBER', 'SIGNATURE', 'CHECKBOX'] as const;
const exitMethodValues = ['MANUAL', 'QR_SCAN', 'GATE_PASS'] as const;

const optionalUuid = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value;
}, z.string().uuid().optional().nullable());

const optionalString = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable().optional());

const optionalDecimal = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return String(value);
  return value;
}, z.string().nullable().optional());

const gateSchema = z.object({
  gateName: z.string().min(1),
  plantId: optionalUuid,
  gateType: z.enum(gateTypeValues).default('MAIN_GATE'),
  location: optionalString,
  securityUserIds: z.array(z.string().uuid()).default([]),
  isActive: z.boolean().default(true),
});

const templateSchema = z.object({
  gateId: z.string().uuid(),
  plantId: optionalUuid,
  templateName: z.string().min(1),
  visitorType: z.string().min(1),
  allowedRoles: z.array(z.string()).optional().nullable(),
  frequency: optionalString,
  securityLevel: optionalString,
  departmentId: optionalUuid,
  moduleId: optionalUuid,
  machineId: optionalUuid,
  isActive: z.boolean().default(true),
});

const templateUserSchema = z.object({
  allowedUserType: z.string().min(1),
  departmentId: optionalUuid,
  approvalRequired: z.boolean().default(false),
});

const templateFieldSchema = z.object({
  fieldName: z.string().min(1),
  fieldLabel: z.string().min(1),
  fieldType: z.enum(fieldTypeValues).default('TEXT'),
  options: z.array(z.string()).optional().nullable(),
  isRequired: z.boolean().default(false),
  unit: optionalString,
  allowedMin: optionalDecimal,
  allowedMax: optionalDecimal,
  placeholder: optionalString,
  fieldGroup: optionalString,
  captureKey: optionalString,
  helpText: optionalString,
  defaultValue: optionalString,
  isEnvironmental: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
});

const fieldValueSchema = z.object({
  fieldId: optionalUuid,
  fieldName: optionalString,
  fieldLabel: optionalString,
  fieldType: optionalString,
  unit: optionalString,
  value: z.unknown().optional(),
});

const gateEntrySchema = z.object({
  gateId: z.string().uuid(),
  templateId: optionalUuid,
  plantId: optionalUuid,
  departmentId: optionalUuid,
  moduleId: optionalUuid,
  machineId: optionalUuid,
  visitorName: optionalString,
  visitorCompany: optionalString,
  visitorPhone: optionalString,
  visitorType: optionalString,
  purpose: optionalString,
  personToMeet: optionalString,
  vehicleNumber: optionalString,
  idProofType: optionalString,
  idProofNumber: optionalString,
  itemsCarried: optionalString,
  vendorName: optionalString,
  materialDescription: optionalString,
  quantity: optionalDecimal,
  gatePassNumber: optionalString,
  invoiceNumber: optionalString,
  remarks: optionalString,
  entryTime: optionalString,
  fieldValues: z.array(fieldValueSchema).default([]),
  blacklistAlert: z.boolean().optional(),
  watchlistAlert: z.boolean().optional(),
});

const gateEntryPatchSchema = gateEntrySchema.partial().extend({
  status: optionalString,
  duplicateDetected: z.boolean().optional(),
});

const exitSchema = z.object({
  exitTime: optionalString,
  exitMethod: z.enum(exitMethodValues).default('MANUAL'),
  exitApprovedBy: optionalUuid,
  remarks: optionalString,
});

const reportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'excel', 'pdf']).default('json'),
  gateId: optionalUuid,
  templateId: optionalUuid,
  visitorType: optionalString,
  visitorName: optionalString,
  vehicleNumber: optionalString,
  status: optionalString,
  dateFrom: optionalString,
  dateTo: optionalString,
  plantId: optionalUuid,
});

function normalizeToken(source: string) {
  return source.trim();
}

function normalizeLookupKey(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function coalesceString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function toDecimalString(value: number | null | undefined, scale = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return value.toFixed(scale);
}

function parseNumericValue(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFieldValue(fieldValues: Array<z.infer<typeof fieldValueSchema>>, keys: string[]) {
  const normalizedKeys = keys.map((key) => normalizeLookupKey(key));
  const match = fieldValues.find((item) => {
    const candidates = [item.fieldName, item.fieldLabel].map((value) => normalizeLookupKey(value));
    return candidates.some((candidate) => normalizedKeys.includes(candidate));
  });
  if (!match || match.value === undefined || match.value === null) {
    return null;
  }
  if (typeof match.value === 'string') {
    return match.value.trim() || null;
  }
  return String(match.value);
}

function looksLikeVehicleMovement(visitorType: string | null, fieldValues: Array<z.infer<typeof fieldValueSchema>>) {
  const normalizedType = normalizeLookupKey(visitorType);
  if (normalizedType.includes('VEHICLE') || normalizedType.includes('MATERIAL') || normalizedType.includes('COURIER')) {
    return true;
  }
  return Boolean(
    getFieldValue(fieldValues, ['vehicle_number', 'driver_name', 'material_description', 'gate_pass_number', 'invoice_number']),
  );
}

function normalizeEntryFieldValues(fieldValues: Array<z.infer<typeof fieldValueSchema>>) {
  return fieldValues.map((item) => ({
    fieldId: item.fieldId ?? null,
    fieldName: item.fieldName ?? null,
    fieldLabel: item.fieldLabel ?? null,
    fieldType: item.fieldType ?? null,
    unit: item.unit ?? null,
    value: item.value ?? null,
  }));
}

function resolveFieldAliases(fieldValues: Array<z.infer<typeof fieldValueSchema>>, keys: string[]) {
  return coalesceString(...keys.map((key) => getFieldValue(fieldValues, [key])));
}

function computeTransportEmissionKg(options: {
  distanceKm?: number | null;
  idleTimeMinutes?: number | null;
  materialWeightKg?: number | null;
  wasteQuantityKg?: number | null;
  transportMode?: string | null;
  fuelType?: string | null;
}) {
  const transportModeKey = normalizeLookupKey(options.transportMode);
  const fuelKey = normalizeLookupKey(options.fuelType);
  const distanceKm = options.distanceKm ?? 0;
  const idleTimeMinutes = options.idleTimeMinutes ?? 0;
  const cargoWeightKg = (options.materialWeightKg ?? 0) + (options.wasteQuantityKg ?? 0);

  const distanceFactor =
    {
      ROAD: 0.18,
      TRUCK: 0.21,
      RAIL: 0.04,
      SEA: 0.015,
      AIR: 0.57,
      INTERNAL: 0.1,
    }[transportModeKey] ?? 0.18;

  const idleFactor =
    {
      DIESEL: 0.03,
      PETROL: 0.028,
      CNG: 0.015,
      LNG: 0.02,
      ELECTRIC: 0.01,
    }[fuelKey] ?? 0.025;

  const weightMultiplier = 1 + Math.min(cargoWeightKg, 50000) / 100000;
  const distanceEmissions = distanceKm * distanceFactor * weightMultiplier;
  const idleEmissions = idleTimeMinutes * idleFactor;
  return Number((distanceEmissions + idleEmissions).toFixed(6));
}

function abbreviateGateType(gateType: string) {
  return gateType
    .split('_')
    .map((item) => item[0] ?? '')
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

async function buildGateCode(plantId: string | null, gateType: string) {
  const repo = AppDataSource.getRepository(GateEntity);
  const count = await repo.count({ where: plantId ? { plantId } : {} });
  return `${abbreviateGateType(gateType)}-${String(count + 1).padStart(3, '0')}`;
}

async function getTemplateFields(templateId: string) {
  const fieldRepo = AppDataSource.getRepository(GateTemplateFieldEntity);
  return fieldRepo.find({
    where: { templateId },
    order: { displayOrder: 'ASC', createdAt: 'ASC' },
  });
}

async function getLatestUpdateIso(
  entityClass:
    | typeof GateEntity
    | typeof GateEntryTypeEntity
    | typeof GateTemplateFieldEntity
    | typeof GateTemplateUserEntity
    | typeof GateEntryEntity
    | typeof GateVehicleEntryEntity
    | typeof GateMaterialEntryEntity
    | typeof GateExitLogEntity
    | typeof GhgTransportLogEntity,
  alias: string,
) {
  const raw = await AppDataSource.getRepository(entityClass)
    .createQueryBuilder(alias)
    .select(`MAX(${alias}.updatedAt)`, 'updatedAt')
    .getRawOne<{ updatedAt?: string | null }>();
  return raw?.updatedAt ?? null;
}

async function detectDuplicateEntry(
  plantId: string | null,
  visitorName: string | null,
  visitorPhone: string | null,
  vehicleNumber: string | null,
) {
  if (!plantId || (!visitorName && !visitorPhone && !vehicleNumber)) {
    return false;
  }

  const repo = AppDataSource.getRepository(GateEntryEntity);
  const qb = repo.createQueryBuilder('entry').where('entry.plant_id = :plantId', { plantId }).andWhere('entry.status = :status', { status: 'IN' });
  qb.andWhere(
    new Brackets((inner) => {
      if (visitorName) {
        inner.orWhere('LOWER(entry.visitor_name) = :visitorName', { visitorName: visitorName.toLowerCase() });
      }
      if (visitorPhone) {
        inner.orWhere('entry.visitor_phone = :visitorPhone', { visitorPhone });
      }
      if (vehicleNumber) {
        inner.orWhere('LOWER(entry.vehicle_number) = :vehicleNumber', { vehicleNumber: vehicleNumber.toLowerCase() });
      }
    }),
  );

  return Boolean(await qb.getOne());
}

async function resolveWatchAlerts(payload: {
  plantId: string | null;
  visitorName: string | null;
  vehicleNumber: string | null;
  idProofNumber: string | null;
}) {
  if (!payload.plantId || (!payload.visitorName && !payload.vehicleNumber && !payload.idProofNumber)) {
    return { blacklistAlert: false, watchlistAlert: false };
  }

  const repo = AppDataSource.getRepository(GateEntryEntity);
  const qb = repo.createQueryBuilder('entry').where('entry.plant_id = :plantId', { plantId: payload.plantId });
  qb.andWhere(
    new Brackets((inner) => {
      if (payload.visitorName) {
        inner.orWhere('LOWER(entry.visitor_name) = :visitorName', { visitorName: payload.visitorName.toLowerCase() });
      }
      if (payload.vehicleNumber) {
        inner.orWhere('LOWER(entry.vehicle_number) = :vehicleNumber', { vehicleNumber: payload.vehicleNumber.toLowerCase() });
      }
      if (payload.idProofNumber) {
        inner.orWhere('entry.id_proof_number = :idProofNumber', { idProofNumber: payload.idProofNumber });
      }
    }),
  );
  qb.andWhere('(entry.blacklist_alert = :blacklist OR entry.watchlist_alert = :watchlist)', {
    blacklist: true,
    watchlist: true,
  });

  const rows = await qb.getMany();
  return {
    blacklistAlert: rows.some((item) => item.blacklistAlert),
    watchlistAlert: rows.some((item) => item.watchlistAlert),
  };
}

function applyGateEntryFilters(
  qb: SelectQueryBuilder<GateEntryEntity>,
  filters: {
    gateId?: string | null;
    templateId?: string | null;
    visitorType?: string | null;
    visitorName?: string | null;
    vehicleNumber?: string | null;
    status?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  },
) {
  if (filters.gateId) {
    qb.andWhere('entry.gate_id = :gateId', { gateId: filters.gateId });
  }
  if (filters.templateId) {
    qb.andWhere('entry.template_id = :templateId', { templateId: filters.templateId });
  }
  if (filters.visitorType) {
    qb.andWhere('LOWER(entry.visitor_type) = :visitorType', { visitorType: filters.visitorType.toLowerCase() });
  }
  if (filters.visitorName) {
    qb.andWhere('LOWER(entry.visitor_name) LIKE :visitorName', { visitorName: `%${filters.visitorName.toLowerCase()}%` });
  }
  if (filters.vehicleNumber) {
    qb.andWhere('LOWER(entry.vehicle_number) LIKE :vehicleNumber', { vehicleNumber: `%${filters.vehicleNumber.toLowerCase()}%` });
  }
  if (filters.status) {
    qb.andWhere('LOWER(entry.status) = :status', { status: filters.status.toLowerCase() });
  }
  if (filters.dateFrom) {
    qb.andWhere('entry.entry_time >= :dateFrom', { dateFrom: new Date(filters.dateFrom) });
  }
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    qb.andWhere('entry.entry_time <= :dateTo', { dateTo: end });
  }
}

async function createVehicleMovementRecord(entry: GateEntryEntity, visitorType: string | null, fieldValues: Array<z.infer<typeof fieldValueSchema>>) {
  if (!looksLikeVehicleMovement(visitorType, fieldValues)) {
    return null;
  }

  const vehicleRepo = AppDataSource.getRepository(GateVehicleEntryEntity);
  const driverContact = resolveFieldAliases(fieldValues, ['driver_contact', 'driver_phone', 'mobile_number']);
  const vehicleType = resolveFieldAliases(fieldValues, ['vehicle_type']);
  const fuelType = resolveFieldAliases(fieldValues, ['vehicle_fuel_type', 'fuel_type']);
  const engineType = resolveFieldAliases(fieldValues, ['vehicle_engine_type', 'engine_type']);
  const transportDistance = resolveFieldAliases(fieldValues, ['transport_distance', 'transport_distance_km', 'distance_km']);
  const transportMode = resolveFieldAliases(fieldValues, ['transport_mode']);
  const loadWeight = resolveFieldAliases(fieldValues, ['load_weight', 'material_weight']);
  const unloadWeight = resolveFieldAliases(fieldValues, ['unload_weight']);
  const idleTime = resolveFieldAliases(fieldValues, ['vehicle_idle_time', 'idle_time_minutes']);
  const wasteType = resolveFieldAliases(fieldValues, ['waste_type']);
  const wasteQuantity = resolveFieldAliases(fieldValues, ['waste_quantity']);
  const emissionCategory = resolveFieldAliases(fieldValues, ['emission_category']);
  const movementType = normalizeLookupKey(visitorType).includes('MATERIAL_OUTWARD')
    ? 'MATERIAL_OUTWARD'
    : normalizeLookupKey(visitorType).includes('MATERIAL_INWARD')
      ? 'MATERIAL_INWARD'
      : normalizeLookupKey(visitorType).includes('WASTE')
        ? 'WASTE_DISPOSAL'
      : 'VEHICLE_ENTRY';

  const estimatedCo2eKg = computeTransportEmissionKg({
    distanceKm: parseNumericValue(transportDistance),
    idleTimeMinutes: parseNumericValue(idleTime),
    materialWeightKg: parseNumericValue(loadWeight),
    wasteQuantityKg: parseNumericValue(wasteQuantity),
    transportMode,
    fuelType,
  });

  const created = vehicleRepo.create({
    gateEntryId: entry.id,
    gateId: entry.gateId,
    plantId: entry.plantId,
    templateId: entry.templateId,
    movementType,
    vehicleNumber: coalesceString(entry.vehicleNumber, getFieldValue(fieldValues, ['vehicle_number'])),
    driverName: getFieldValue(fieldValues, ['driver_name']),
    driverContact,
    vehicleType,
    fuelType,
    engineType,
    vendorName: coalesceString(entry.vendorName, getFieldValue(fieldValues, ['vendor_name', 'company'])),
    materialDescription: coalesceString(entry.materialDescription, getFieldValue(fieldValues, ['material_description'])),
    quantity: coalesceString(entry.quantity, getFieldValue(fieldValues, ['quantity'])),
    gatePassNumber: coalesceString(entry.gatePassNumber, getFieldValue(fieldValues, ['gate_pass_number'])),
    invoiceNumber: coalesceString(entry.invoiceNumber, getFieldValue(fieldValues, ['invoice_number'])),
    transportDistanceKm: transportDistance,
    transportMode,
    loadWeight,
    unloadWeight,
    idleTimeMinutes: idleTime,
    wasteType,
    wasteQuantity,
    emissionCategory,
    estimatedCo2eKg: toDecimalString(estimatedCo2eKg, 6),
    remarks: entry.remarks,
    entryTime: entry.entryTime,
  });

  return vehicleRepo.save(created);
}

async function createMaterialMovementRecord(entry: GateEntryEntity, visitorType: string | null, fieldValues: Array<z.infer<typeof fieldValueSchema>>) {
  const normalizedType = normalizeLookupKey(visitorType);
  if (!normalizedType.includes('MATERIAL') && !normalizedType.includes('WASTE')) {
    return null;
  }

  const materialRepo = AppDataSource.getRepository(GateMaterialEntryEntity);
  const materialName = resolveFieldAliases(fieldValues, ['material_name', 'material_description']);
  const materialCategory = resolveFieldAliases(fieldValues, ['material_category', 'material_type']);
  const quantity = resolveFieldAliases(fieldValues, ['quantity', 'material_quantity']);
  const unitOfMeasurement = resolveFieldAliases(fieldValues, ['unit_of_measurement', 'unit']);
  const vendor = resolveFieldAliases(fieldValues, ['vendor_name', 'company']);
  const purchaseOrderNumber = resolveFieldAliases(fieldValues, ['purchase_order_number', 'po_number']);
  const gatePassNumber = resolveFieldAliases(fieldValues, ['gate_pass_number']);
  const invoiceNumber = resolveFieldAliases(fieldValues, ['invoice_number']);
  const hazardCategory = resolveFieldAliases(fieldValues, ['material_hazard_category', 'hazard_category']);
  const transportMode = resolveFieldAliases(fieldValues, ['transport_mode']);
  const transportDistanceKm = resolveFieldAliases(fieldValues, ['transport_distance', 'transport_distance_km', 'distance_km']);
  const emissionCategory = resolveFieldAliases(fieldValues, ['emission_category']);
  const estimatedCo2eKg = computeTransportEmissionKg({
    distanceKm: parseNumericValue(transportDistanceKm),
    materialWeightKg: parseNumericValue(quantity),
    transportMode,
    fuelType: resolveFieldAliases(fieldValues, ['vehicle_fuel_type', 'fuel_type']),
  });

  const created = materialRepo.create({
    gateEntryId: entry.id,
    gateId: entry.gateId,
    plantId: entry.plantId,
    entryTypeId: entry.templateId,
    materialName,
    materialCategory,
    quantity,
    unitOfMeasurement,
    vendor,
    purchaseOrderNumber,
    gatePassNumber: coalesceString(entry.gatePassNumber, gatePassNumber),
    invoiceNumber: coalesceString(entry.invoiceNumber, invoiceNumber),
    hazardCategory,
    transportMode,
    transportDistanceKm,
    emissionCategory,
    estimatedCo2eKg: toDecimalString(estimatedCo2eKg, 6),
    entryTime: entry.entryTime,
  });

  return materialRepo.save(created);
}

async function createTransportEmissionLog(entry: GateEntryEntity, fieldValues: Array<z.infer<typeof fieldValueSchema>>) {
  const fuelType = resolveFieldAliases(fieldValues, ['vehicle_fuel_type', 'fuel_type']);
  const engineType = resolveFieldAliases(fieldValues, ['vehicle_engine_type', 'engine_type']);
  const transportMode = resolveFieldAliases(fieldValues, ['transport_mode']);
  const distanceKm = parseNumericValue(resolveFieldAliases(fieldValues, ['transport_distance', 'transport_distance_km', 'distance_km']));
  const idleTimeMinutes = parseNumericValue(resolveFieldAliases(fieldValues, ['vehicle_idle_time', 'idle_time_minutes']));
  const materialWeightKg = parseNumericValue(resolveFieldAliases(fieldValues, ['material_weight', 'load_weight', 'quantity']));
  const wasteQuantityKg = parseNumericValue(resolveFieldAliases(fieldValues, ['waste_quantity']));
  const emissionCategory = resolveFieldAliases(fieldValues, ['emission_category']) ?? 'TRANSPORT';

  if (!fuelType && !transportMode && !distanceKm && !idleTimeMinutes && !materialWeightKg && !wasteQuantityKg) {
    return null;
  }

  const co2e = computeTransportEmissionKg({
    distanceKm,
    idleTimeMinutes,
    materialWeightKg,
    wasteQuantityKg,
    transportMode,
    fuelType,
  });

  const ghgRepo = AppDataSource.getRepository(GhgTransportLogEntity);
  const created = ghgRepo.create({
    gateEntryId: entry.id,
    gateId: entry.gateId,
    plantId: entry.plantId,
    entryTypeId: entry.templateId,
    sourceKind: normalizeLookupKey(entry.visitorType).includes('WASTE') ? 'WASTE_TRANSPORT' : 'TRANSPORT',
    fuelType,
    engineType,
    transportMode,
    distanceKm: toDecimalString(distanceKm),
    idleTimeMinutes: toDecimalString(idleTimeMinutes),
    materialWeightKg: toDecimalString(materialWeightKg),
    wasteQuantityKg: toDecimalString(wasteQuantityKg),
    emissionCategory,
    scopeCategory: 'SCOPE_3',
    computedCo2eKg: toDecimalString(co2e, 6) ?? '0.000000',
    metadata: {
      visitorType: entry.visitorType,
      vehicleNumber: entry.vehicleNumber,
      gatePassNumber: entry.gatePassNumber,
    },
  });
  return ghgRepo.save(created);
}

async function decorateGates(gates: GateEntity[]) {
  const templateRepo = AppDataSource.getRepository(GateEntryTypeEntity);
  const entryRepo = AppDataSource.getRepository(GateEntryEntity);
  const gateIds = gates.map((gate) => gate.id);
  if (gateIds.length === 0) {
    return [];
  }

  const [templateCounts, activeEntries] = await Promise.all([
    templateRepo
      .createQueryBuilder('template')
      .select('template.gate_id', 'gateId')
      .addSelect('COUNT(*)', 'count')
      .where('template.gate_id IN (:...gateIds)', { gateIds })
      .andWhere('template.is_active = :active', { active: true })
      .groupBy('template.gate_id')
      .getRawMany<{ gateId: string; count: string }>(),
    entryRepo
      .createQueryBuilder('entry')
      .select('entry.gate_id', 'gateId')
      .addSelect('COUNT(*)', 'count')
      .where('entry.gate_id IN (:...gateIds)', { gateIds })
      .andWhere('entry.status = :status', { status: 'IN' })
      .groupBy('entry.gate_id')
      .getRawMany<{ gateId: string; count: string }>(),
  ]);

  const templateMap = new Map(templateCounts.map((row) => [row.gateId, Number(row.count)]));
  const activeMap = new Map(activeEntries.map((row) => [row.gateId, Number(row.count)]));

  return gates.map((gate) => ({
    ...gate,
    templateCount: templateMap.get(gate.id) ?? 0,
    activeVisitors: activeMap.get(gate.id) ?? 0,
    securityAssignmentsCount: gate.securityUserIds?.length ?? 0,
  }));
}

export const gatesRouter = Router();
gatesRouter.use(requireAuth);

gatesRouter.get('/gate-sync-status', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, requestedPlantId ?? null);
    if (resolvedPlantId) {
      ensurePlantAccess(req, resolvedPlantId);
    }

    const [gateUpdatedAt, entryTypeUpdatedAt, fieldUpdatedAt, userUpdatedAt, entryUpdatedAt, vehicleUpdatedAt, materialUpdatedAt, exitUpdatedAt, ghgUpdatedAt] =
      await Promise.all([
        getLatestUpdateIso(GateEntity, 'gateSync'),
        getLatestUpdateIso(GateEntryTypeEntity, 'entryTypeSync'),
        getLatestUpdateIso(GateTemplateFieldEntity, 'fieldSync'),
        getLatestUpdateIso(GateTemplateUserEntity, 'templateUserSync'),
        getLatestUpdateIso(GateEntryEntity, 'entrySync'),
        getLatestUpdateIso(GateVehicleEntryEntity, 'vehicleSync'),
        getLatestUpdateIso(GateMaterialEntryEntity, 'materialSync'),
        getLatestUpdateIso(GateExitLogEntity, 'exitSync'),
        getLatestUpdateIso(GhgTransportLogEntity, 'ghgSync'),
      ]);

    const configVersion = [gateUpdatedAt, entryTypeUpdatedAt, fieldUpdatedAt, userUpdatedAt].filter(Boolean).sort().at(-1) ?? null;
    const activityVersion = [entryUpdatedAt, vehicleUpdatedAt, materialUpdatedAt, exitUpdatedAt, ghgUpdatedAt].filter(Boolean).sort().at(-1) ?? null;
    res.json(
      ok(
        {
          configVersion,
          activityVersion,
          generatedAt: new Date().toISOString(),
        },
        'Gate sync status fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gates', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(GateEntity);
    const qb = repo.createQueryBuilder('gate').leftJoinAndSelect('gate.plant', 'plant');
    applySearch(qb, 'gate', query.search, ['gate_code', 'gate_name', 'location', 'gate_type']);
    applyPlantScope(qb, 'gate', 'plant_id', req.auth!, query.plantId);
    if (!query.includeInactive) {
      qb.andWhere('gate.is_active = :active', { active: true });
    }
    qb.orderBy('gate.gateName', 'ASC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    const decorated = await decorateGates(rows);
    res.json(ok(decorated, 'Gates fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gates/:id', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(GateEntity);
    const entity = await repo.findOne({ where: { id: params.id }, relations: { plant: true } });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    const [decorated] = await decorateGates([entity]);
    res.json(ok(decorated, 'Gate fetched'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.post('/gates', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'CREATE'), async (req, res, next) => {
  try {
    const body = gateSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const repo = AppDataSource.getRepository(GateEntity);
    const created = repo.create({
      ...body,
      securityUserIds: body.securityUserIds?.length ? body.securityUserIds : null,
      plantId: resolvedPlantId,
      gateCode: await buildGateCode(resolvedPlantId, body.gateType),
    });
    await repo.save(created);
    const [decorated] = await decorateGates([created]);
    res.status(201).json(ok(decorated, 'Gate created'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.patch('/gates/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = gateSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(GateEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate not found' });
      return;
    }

    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, nextPlantId);
    Object.assign(entity, {
      ...body,
      plantId: nextPlantId,
      securityUserIds: body.securityUserIds === undefined ? entity.securityUserIds : body.securityUserIds,
    });
    await repo.save(entity);
    const [decorated] = await decorateGates([entity]);
    res.json(ok(decorated, 'Gate updated'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.delete('/gates/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(GateEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    entity.isActive = false;
    await repo.save(entity);
    res.json(ok({ id: entity.id, deleted: true }, 'Gate deactivated'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-templates', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const extra = z.object({ gateId: optionalUuid, visitorType: optionalString }).parse(req.query);
    const repo = AppDataSource.getRepository(GateEntryTypeEntity);
    const qb = repo
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.gate', 'gate')
      .leftJoinAndSelect('template.plant', 'plant')
      .leftJoinAndSelect('template.department', 'department')
      .leftJoinAndSelect('template.module', 'module')
      .leftJoinAndSelect('template.machine', 'machine');

    applySearch(qb, 'template', query.search, ['template_name', 'visitor_type']);
    applyPlantScope(qb, 'template', 'plant_id', req.auth!, query.plantId);
    if (!query.includeInactive) {
      qb.andWhere('template.is_active = :active', { active: true });
    }
    if (extra.gateId) {
      qb.andWhere('template.gate_id = :gateId', { gateId: extra.gateId });
    }
    if (extra.visitorType) {
      qb.andWhere('LOWER(template.visitor_type) = :visitorType', { visitorType: extra.visitorType.toLowerCase() });
    }

    qb.orderBy('template.templateName', 'ASC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();

    const templateIds = rows.map((item) => item.id);
    const fieldCounts = templateIds.length
      ? await AppDataSource.getRepository(GateTemplateFieldEntity)
          .createQueryBuilder('field')
          .select('field.template_id', 'templateId')
          .addSelect('COUNT(*)', 'count')
          .where('field.template_id IN (:...templateIds)', { templateIds })
          .groupBy('field.template_id')
          .getRawMany<{ templateId: string; count: string }>()
      : [];

    const fieldCountMap = new Map(fieldCounts.map((row) => [row.templateId, Number(row.count)]));
    const data = rows.map((row) => ({
      ...row,
      fieldCount: fieldCountMap.get(row.id) ?? 0,
    }));
    res.json(ok(data, 'Gate templates fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-templates/:id', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(GateEntryTypeEntity);
    const entity = await repo.findOne({
      where: { id: params.id },
      relations: { gate: true, plant: true, department: true, module: true, machine: true },
    });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate template not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    const fields = await getTemplateFields(entity.id);
    res.json(ok({ ...entity, fields }, 'Gate template fetched'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.post('/gate-templates', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'CREATE'), async (req, res, next) => {
  try {
    const body = templateSchema.parse(req.body);
    const gateRepo = AppDataSource.getRepository(GateEntity);
    const gate = await gateRepo.findOneBy({ id: body.gateId });
    if (!gate) {
      res.status(404).json({ success: false, message: 'Gate not found' });
      return;
    }

    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? gate.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);
    const repo = AppDataSource.getRepository(GateEntryTypeEntity);
    const created = repo.create({
      id: randomUUID(),
      ...body,
      plantId: resolvedPlantId,
      gateId: gate.id,
      createdBy: req.auth!.userId,
      allowedRoles: body.allowedRoles?.length ? body.allowedRoles : null,
      frequency: body.frequency ?? null,
      securityLevel: body.securityLevel ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Gate template created'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.patch('/gate-templates/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = templateSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(GateEntryTypeEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate template not found' });
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, nextPlantId);
    Object.assign(entity, {
      ...body,
      plantId: nextPlantId,
      allowedRoles: body.allowedRoles === undefined ? entity.allowedRoles : body.allowedRoles,
      frequency: body.frequency === undefined ? entity.frequency : body.frequency,
      securityLevel: body.securityLevel === undefined ? entity.securityLevel : body.securityLevel,
    });
    await repo.save(entity);
    res.json(ok(entity, 'Gate template updated'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.delete('/gate-templates/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(GateEntryTypeEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate template not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    entity.isActive = false;
    await repo.save(entity);
    res.json(ok({ id: entity.id, deleted: true }, 'Gate template deactivated'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-templates/:id/fields', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const template = await AppDataSource.getRepository(GateEntryTypeEntity).findOneBy({ id: params.id });
    if (!template) {
      res.status(404).json({ success: false, message: 'Gate template not found' });
      return;
    }
    ensurePlantAccess(req, template.plantId);
    const fields = await getTemplateFields(template.id);
    res.json(ok(fields, 'Gate template fields fetched'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.post('/gate-templates/:id/fields', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'CREATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = templateFieldSchema.parse(req.body);
    const templateRepo = AppDataSource.getRepository(GateEntryTypeEntity);
    const template = await templateRepo.findOneBy({ id: params.id });
    if (!template) {
      res.status(404).json({ success: false, message: 'Gate template not found' });
      return;
    }
    ensurePlantAccess(req, template.plantId);

    const fieldRepo = AppDataSource.getRepository(GateTemplateFieldEntity);
    const created = fieldRepo.create({
      ...body,
      templateId: template.id,
      options: body.options ?? null,
      unit: body.unit ?? null,
      allowedMin: body.allowedMin ?? null,
      allowedMax: body.allowedMax ?? null,
      placeholder: body.placeholder ?? null,
      fieldGroup: body.fieldGroup ?? null,
      captureKey: body.captureKey ?? null,
      helpText: body.helpText ?? null,
      defaultValue: body.defaultValue ?? null,
      isEnvironmental: body.isEnvironmental ?? false,
    });
    await fieldRepo.save(created);
    res.status(201).json(ok(created, 'Gate template field created'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.patch('/gate-template-fields/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = templateFieldSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(GateTemplateFieldEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate template field not found' });
      return;
    }
    const template = await AppDataSource.getRepository(GateEntryTypeEntity).findOneBy({ id: entity.templateId });
    ensurePlantAccess(req, template?.plantId ?? null);
    Object.assign(entity, {
      ...body,
      fieldGroup: body.fieldGroup === undefined ? entity.fieldGroup : body.fieldGroup,
      captureKey: body.captureKey === undefined ? entity.captureKey : body.captureKey,
      helpText: body.helpText === undefined ? entity.helpText : body.helpText,
      defaultValue: body.defaultValue === undefined ? entity.defaultValue : body.defaultValue,
      isEnvironmental: body.isEnvironmental ?? entity.isEnvironmental,
    });
    await repo.save(entity);
    res.json(ok(entity, 'Gate template field updated'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.delete('/gate-template-fields/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(GateTemplateFieldEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate template field not found' });
      return;
    }
    const template = await AppDataSource.getRepository(GateEntryTypeEntity).findOneBy({ id: entity.templateId });
    ensurePlantAccess(req, template?.plantId ?? null);
    await repo.delete({ id: entity.id });
    res.json(ok({ id: entity.id, deleted: true }, 'Gate template field deleted'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-templates/:id/users', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const template = await AppDataSource.getRepository(GateEntryTypeEntity).findOneBy({ id: params.id });
    if (!template) {
      res.status(404).json({ success: false, message: 'Gate template not found' });
      return;
    }
    ensurePlantAccess(req, template.plantId);

    const repo = AppDataSource.getRepository(GateTemplateUserEntity);
    const users = await repo.find({
      where: { templateId: template.id },
      relations: { department: true },
      order: { createdAt: 'ASC' },
    });
    res.json(ok(users, 'Gate template users fetched'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.post('/gate-templates/:id/users', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'CREATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = templateUserSchema.parse(req.body);
    const template = await AppDataSource.getRepository(GateEntryTypeEntity).findOneBy({ id: params.id });
    if (!template) {
      res.status(404).json({ success: false, message: 'Gate template not found' });
      return;
    }
    ensurePlantAccess(req, template.plantId);

    const repo = AppDataSource.getRepository(GateTemplateUserEntity);
    const created = repo.create({
      templateId: template.id,
      allowedUserType: body.allowedUserType,
      departmentId: body.departmentId ?? null,
      approvalRequired: body.approvalRequired ?? false,
    });
    await repo.save(created);
    const saved = await repo.findOne({ where: { id: created.id }, relations: { department: true } });
    res.status(201).json(ok(saved ?? created, 'Gate template user created'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.patch('/gate-template-users/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = templateUserSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(GateTemplateUserEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate template user not found' });
      return;
    }
    const template = await AppDataSource.getRepository(GateEntryTypeEntity).findOneBy({ id: entity.templateId });
    ensurePlantAccess(req, template?.plantId ?? null);

    Object.assign(entity, {
      allowedUserType: body.allowedUserType === undefined ? entity.allowedUserType : body.allowedUserType,
      departmentId: body.departmentId === undefined ? entity.departmentId : body.departmentId,
      approvalRequired: body.approvalRequired === undefined ? entity.approvalRequired : body.approvalRequired,
    });
    await repo.save(entity);
    const saved = await repo.findOne({ where: { id: entity.id }, relations: { department: true } });
    res.json(ok(saved ?? entity, 'Gate template user updated'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.delete('/gate-template-users/:id', requireRole(['SUPER_ADMIN', 'PLANT_ADMIN']), requirePermission('GATES', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(GateTemplateUserEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate template user not found' });
      return;
    }
    const template = await AppDataSource.getRepository(GateEntryTypeEntity).findOneBy({ id: entity.templateId });
    ensurePlantAccess(req, template?.plantId ?? null);
    await repo.delete({ id: entity.id });
    res.json(ok({ id: entity.id, deleted: true }, 'Gate template user deleted'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-entries', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const filters = z
      .object({
        gateId: optionalUuid,
        templateId: optionalUuid,
        visitorType: optionalString,
        visitorName: optionalString,
        vehicleNumber: optionalString,
        status: optionalString,
        dateFrom: optionalString,
        dateTo: optionalString,
      })
      .parse(req.query);

    const repo = AppDataSource.getRepository(GateEntryEntity);
    const qb = repo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.gate', 'gate')
      .leftJoinAndSelect('entry.template', 'template')
      .leftJoinAndSelect('entry.plant', 'plant')
      .leftJoinAndSelect('entry.recordedByUser', 'recordedByUser')
      .leftJoinAndSelect('entry.exitApprovedByUser', 'exitApprovedByUser');

    applySearch(qb, 'entry', query.search, [
      'visitor_name',
      'visitor_company',
      'visitor_phone',
      'visitor_type',
      'person_to_meet',
      'vehicle_number',
      'gate_pass_number',
      'invoice_number',
    ]);
    applyPlantScope(qb, 'entry', 'plant_id', req.auth!, query.plantId);
    applyGateEntryFilters(qb, filters);
    qb.orderBy('entry.entryTime', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows, 'Gate entries fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-entries/:id', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(GateEntryEntity);
    const entity = await repo.findOne({
      where: { id: params.id },
      relations: {
        gate: true,
        template: true,
        plant: true,
        department: true,
        module: true,
        machine: true,
        recordedByUser: true,
        exitApprovedByUser: true,
      },
    });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate entry not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    res.json(ok(entity, 'Gate entry fetched'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.post('/gate-entries', requirePermission('GATES', 'CREATE'), async (req, res, next) => {
  try {
    const body = gateEntrySchema.parse(req.body);
    const gateRepo = AppDataSource.getRepository(GateEntity);
    const templateRepo = AppDataSource.getRepository(GateEntryTypeEntity);
    const entryRepo = AppDataSource.getRepository(GateEntryEntity);

    const gate = await gateRepo.findOneBy({ id: body.gateId });
    if (!gate) {
      res.status(404).json({ success: false, message: 'Gate not found' });
      return;
    }

    const template = body.templateId ? await templateRepo.findOneBy({ id: body.templateId }) : null;
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? template?.plantId ?? gate.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const normalizedFieldValues = normalizeEntryFieldValues(body.fieldValues);
    const visitorName = coalesceString(body.visitorName, getFieldValue(body.fieldValues, ['visitor_name', 'driver_name', 'employee_name']));
    const visitorCompany = coalesceString(body.visitorCompany, getFieldValue(body.fieldValues, ['company', 'vendor_name']));
    const visitorPhone = coalesceString(body.visitorPhone, getFieldValue(body.fieldValues, ['mobile_number', 'phone', 'mobile']));
    const visitorType = coalesceString(body.visitorType, template?.visitorType);
    const purpose = coalesceString(body.purpose, getFieldValue(body.fieldValues, ['purpose_of_visit', 'purpose']));
    const personToMeet = coalesceString(body.personToMeet, getFieldValue(body.fieldValues, ['person_to_meet']));
    const vehicleNumber = coalesceString(body.vehicleNumber, getFieldValue(body.fieldValues, ['vehicle_number']));
    const idProofType = coalesceString(body.idProofType, getFieldValue(body.fieldValues, ['id_proof_type']));
    const idProofNumber = coalesceString(body.idProofNumber, getFieldValue(body.fieldValues, ['id_proof_number']));
    const itemsCarried = coalesceString(body.itemsCarried, getFieldValue(body.fieldValues, ['items_carried']));
    const vendorName = coalesceString(body.vendorName, getFieldValue(body.fieldValues, ['vendor_name', 'company']));
    const materialDescription = coalesceString(body.materialDescription, getFieldValue(body.fieldValues, ['material_description']));
    const quantity = coalesceString(body.quantity, getFieldValue(body.fieldValues, ['quantity']));
    const gatePassNumber = coalesceString(body.gatePassNumber, getFieldValue(body.fieldValues, ['gate_pass_number']));
    const invoiceNumber = coalesceString(body.invoiceNumber, getFieldValue(body.fieldValues, ['invoice_number']));
    const duplicateDetected = await detectDuplicateEntry(resolvedPlantId, visitorName, visitorPhone, vehicleNumber);
    const watchAlerts = await resolveWatchAlerts({ plantId: resolvedPlantId, visitorName, vehicleNumber, idProofNumber });

    const created = entryRepo.create({
      gateId: gate.id,
      templateId: template?.id ?? null,
      plantId: resolvedPlantId,
      departmentId: body.departmentId ?? template?.departmentId ?? null,
      moduleId: body.moduleId ?? template?.moduleId ?? null,
      machineId: body.machineId ?? template?.machineId ?? null,
      visitorName: visitorName ?? 'Unknown Visitor',
      visitorCompany,
      visitorPhone,
      visitorType: visitorType ?? 'VISITOR_ENTRY',
      purpose,
      personToMeet,
      vehicleNumber,
      idProofType,
      idProofNumber,
      itemsCarried,
      vendorName,
      materialDescription,
      quantity,
      gatePassNumber,
      invoiceNumber,
      remarks: body.remarks ?? null,
      entryTime: body.entryTime ? new Date(body.entryTime) : new Date(),
      recordedBy: req.auth!.userId,
      status: 'IN',
      entryData: normalizedFieldValues,
      qrCodeValue: `GE-${randomBytes(8).toString('hex')}`,
      duplicateDetected,
      blacklistAlert: body.blacklistAlert ?? watchAlerts.blacklistAlert,
      watchlistAlert: body.watchlistAlert ?? watchAlerts.watchlistAlert,
    });
    await entryRepo.save(created);
    await Promise.all([
      createVehicleMovementRecord(created, created.visitorType, body.fieldValues),
      createMaterialMovementRecord(created, created.visitorType, body.fieldValues),
      createTransportEmissionLog(created, body.fieldValues),
    ]);

    const saved = await entryRepo.findOne({
      where: { id: created.id },
      relations: { gate: true, template: true, plant: true, recordedByUser: true },
    });
    res.status(201).json(ok(saved ?? created, 'Gate entry recorded'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.patch('/gate-entries/:id', requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = gateEntryPatchSchema.parse(req.body);
    const repo = AppDataSource.getRepository(GateEntryEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate entry not found' });
      return;
    }

    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, resolvedPlantId);

    Object.assign(entity, {
      ...body,
      plantId: resolvedPlantId,
      templateId: body.templateId === undefined ? entity.templateId : body.templateId,
      departmentId: body.departmentId === undefined ? entity.departmentId : body.departmentId,
      moduleId: body.moduleId === undefined ? entity.moduleId : body.moduleId,
      machineId: body.machineId === undefined ? entity.machineId : body.machineId,
      visitorName: body.visitorName === undefined ? entity.visitorName : body.visitorName ?? entity.visitorName,
      visitorCompany: body.visitorCompany === undefined ? entity.visitorCompany : body.visitorCompany,
      visitorPhone: body.visitorPhone === undefined ? entity.visitorPhone : body.visitorPhone,
      visitorType: body.visitorType === undefined ? entity.visitorType : body.visitorType ?? entity.visitorType,
      purpose: body.purpose === undefined ? entity.purpose : body.purpose,
      personToMeet: body.personToMeet === undefined ? entity.personToMeet : body.personToMeet,
      vehicleNumber: body.vehicleNumber === undefined ? entity.vehicleNumber : body.vehicleNumber,
      idProofType: body.idProofType === undefined ? entity.idProofType : body.idProofType,
      idProofNumber: body.idProofNumber === undefined ? entity.idProofNumber : body.idProofNumber,
      itemsCarried: body.itemsCarried === undefined ? entity.itemsCarried : body.itemsCarried,
      vendorName: body.vendorName === undefined ? entity.vendorName : body.vendorName,
      materialDescription: body.materialDescription === undefined ? entity.materialDescription : body.materialDescription,
      quantity: body.quantity === undefined ? entity.quantity : body.quantity,
      gatePassNumber: body.gatePassNumber === undefined ? entity.gatePassNumber : body.gatePassNumber,
      invoiceNumber: body.invoiceNumber === undefined ? entity.invoiceNumber : body.invoiceNumber,
      remarks: body.remarks === undefined ? entity.remarks : body.remarks,
      duplicateDetected: body.duplicateDetected ?? entity.duplicateDetected,
      blacklistAlert: body.blacklistAlert ?? entity.blacklistAlert,
      watchlistAlert: body.watchlistAlert ?? entity.watchlistAlert,
      entryData: body.fieldValues ? normalizeEntryFieldValues(body.fieldValues) : entity.entryData,
      status: body.status ?? entity.status,
    });
    if (body.entryTime) {
      entity.entryTime = new Date(body.entryTime);
    }
    await repo.save(entity);
    const saved = await repo.findOne({
      where: { id: entity.id },
      relations: { gate: true, template: true, plant: true, recordedByUser: true, exitApprovedByUser: true },
    });
    res.json(ok(saved ?? entity, 'Gate entry updated'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.patch('/gate-entries/:id/exit', requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = exitSchema.parse(req.body);
    const entryRepo = AppDataSource.getRepository(GateEntryEntity);
    const exitRepo = AppDataSource.getRepository(GateExitLogEntity);
    const entity = await entryRepo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate entry not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);

    entity.exitTime = body.exitTime ? new Date(body.exitTime) : new Date();
    entity.exitApprovedBy = body.exitApprovedBy ?? req.auth!.userId;
    entity.exitRemarks = body.remarks ?? null;
    entity.status = 'OUT';
    await entryRepo.save(entity);

    const log = exitRepo.create({
      gateEntryId: entity.id,
      gateId: entity.gateId,
      plantId: entity.plantId,
      exitTime: entity.exitTime,
      exitMethod: body.exitMethod,
      exitApprovedBy: entity.exitApprovedBy,
      remarks: body.remarks ?? null,
    });
    await exitRepo.save(log);

    const saved = await entryRepo.findOne({
      where: { id: entity.id },
      relations: { gate: true, template: true, plant: true, recordedByUser: true, exitApprovedByUser: true },
    });
    res.json(ok(saved ?? entity, 'Gate exit recorded'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.delete('/gate-entries/:id', requirePermission('GATES', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(GateEntryEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate entry not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    await repo.delete({ id: entity.id });
    res.json(ok({ id: entity.id, deleted: true }, 'Gate entry deleted'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-passes/:token', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ token: z.string().min(1) }).parse(req.params);
    const repo = AppDataSource.getRepository(GateEntryEntity);
    const entity = await repo.findOne({
      where: { qrCodeValue: normalizeToken(params.token) },
      relations: { gate: true, template: true, plant: true },
    });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate pass not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    res.json(ok(entity, 'Gate pass fetched'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.patch('/gate-passes/:token/exit', requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ token: z.string().min(1) }).parse(req.params);
    const body = exitSchema.parse(req.body);
    const entryRepo = AppDataSource.getRepository(GateEntryEntity);
    const exitRepo = AppDataSource.getRepository(GateExitLogEntity);
    const entity = await entryRepo.findOneBy({ qrCodeValue: normalizeToken(params.token) });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Gate pass not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);

    entity.exitTime = body.exitTime ? new Date(body.exitTime) : new Date();
    entity.exitApprovedBy = body.exitApprovedBy ?? req.auth!.userId;
    entity.exitRemarks = body.remarks ?? null;
    entity.status = 'OUT';
    await entryRepo.save(entity);

    const log = exitRepo.create({
      gateEntryId: entity.id,
      gateId: entity.gateId,
      plantId: entity.plantId,
      exitTime: entity.exitTime,
      exitMethod: body.exitMethod,
      exitApprovedBy: entity.exitApprovedBy,
      remarks: body.remarks ?? null,
    });
    await exitRepo.save(log);

    const saved = await entryRepo.findOne({
      where: { id: entity.id },
      relations: { gate: true, template: true, plant: true, recordedByUser: true, exitApprovedByUser: true },
    });
    res.json(ok(saved ?? entity, 'Gate exit recorded'));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-vehicle-entries', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(GateVehicleEntryEntity);
    const qb = repo
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.gate', 'gate')
      .leftJoinAndSelect('vehicle.plant', 'plant')
      .leftJoinAndSelect('vehicle.template', 'template');
    applySearch(qb, 'vehicle', query.search, ['vehicle_number', 'driver_name', 'vendor_name', 'material_description', 'movement_type']);
    applyPlantScope(qb, 'vehicle', 'plant_id', req.auth!, query.plantId);
    qb.orderBy('vehicle.entryTime', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows, 'Gate vehicle entries fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-material-entries', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(GateMaterialEntryEntity);
    const qb = repo
      .createQueryBuilder('material')
      .leftJoinAndSelect('material.gate', 'gate')
      .leftJoinAndSelect('material.plant', 'plant')
      .leftJoinAndSelect('material.entryType', 'entryType');
    applySearch(qb, 'material', query.search, ['material_name', 'material_category', 'vendor', 'gate_pass_number', 'invoice_number']);
    applyPlantScope(qb, 'material', 'plant_id', req.auth!, query.plantId);
    qb.orderBy('material.entryTime', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows, 'Gate material entries fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-dashboard/summary', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, requestedPlantId ?? null);
    if (resolvedPlantId) {
      ensurePlantAccess(req, resolvedPlantId);
    }

    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const entryRepo = AppDataSource.getRepository(GateEntryEntity);
    const vehicleRepo = AppDataSource.getRepository(GateVehicleEntryEntity);
    const ghgRepo = AppDataSource.getRepository(GhgTransportLogEntity);

    const entryQb = entryRepo.createQueryBuilder('entry').where('entry.entry_time >= :since', { since });
    const vehicleQb = vehicleRepo.createQueryBuilder('vehicle').where('vehicle.entry_time >= :since', { since });
    const ghgQb = ghgRepo.createQueryBuilder('ghg').where('ghg.created_at >= :since', { since });

    if (resolvedPlantId) {
      entryQb.andWhere('entry.plant_id = :plantId', { plantId: resolvedPlantId });
      vehicleQb.andWhere('vehicle.plant_id = :plantId', { plantId: resolvedPlantId });
      ghgQb.andWhere('ghg.plant_id = :plantId', { plantId: resolvedPlantId });
    } else {
      applyPlantScope(entryQb, 'entry', 'plant_id', req.auth!, undefined);
      applyPlantScope(vehicleQb, 'vehicle', 'plant_id', req.auth!, undefined);
      applyPlantScope(ghgQb, 'ghg', 'plant_id', req.auth!, undefined);
    }

    const [visitorsToday, activeVisitors, vehiclesEntered, materialsInward, materialsOutward, wasteDisposals, transportEmissionsRaw] = await Promise.all([
      entryQb.clone().getCount(),
      entryQb.clone().andWhere('entry.status = :status', { status: 'IN' }).getCount(),
      vehicleQb.clone().getCount(),
      vehicleQb.clone().andWhere('vehicle.movement_type = :movementType', { movementType: 'MATERIAL_INWARD' }).getCount(),
      vehicleQb.clone().andWhere('vehicle.movement_type = :movementType', { movementType: 'MATERIAL_OUTWARD' }).getCount(),
      vehicleQb.clone().andWhere('vehicle.movement_type = :movementType', { movementType: 'WASTE_DISPOSAL' }).getCount(),
      ghgQb.clone().select('COALESCE(SUM(ghg.computed_co2e_kg), 0)', 'total').getRawOne<{ total: string }>(),
    ]);

    res.json(
      ok(
        {
          visitorsToday,
          vehiclesEntered,
          materialsInward,
          materialsOutward,
          activeVisitors,
          wasteDisposals,
          transportEmissionsKgCo2e: Number(transportEmissionsRaw?.total ?? '0'),
        },
        'Gate dashboard summary fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

gatesRouter.get('/gate-reports', requirePermission('GATES', 'EXPORT'), async (req, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const repo = AppDataSource.getRepository(GateEntryEntity);
    const qb = repo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.gate', 'gate')
      .leftJoinAndSelect('entry.plant', 'plant')
      .leftJoinAndSelect('entry.template', 'template');

    applyPlantScope(qb, 'entry', 'plant_id', req.auth!, query.plantId ?? undefined);
    applyGateEntryFilters(qb, query);
    qb.orderBy('entry.entryTime', 'DESC');

    const rows = await qb.getMany();
    const entryIds = rows.map((row) => row.id);
    const [transportLogs, vehicleRows, materialRows] = await Promise.all([
      entryIds.length
        ? AppDataSource.getRepository(GhgTransportLogEntity).find({
            where: entryIds.map((id) => ({ gateEntryId: id })),
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([]),
      entryIds.length
        ? AppDataSource.getRepository(GateVehicleEntryEntity).find({
            where: entryIds.map((id) => ({ gateEntryId: id })),
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([]),
      entryIds.length
        ? AppDataSource.getRepository(GateMaterialEntryEntity).find({
            where: entryIds.map((id) => ({ gateEntryId: id })),
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([]),
    ]);
    const plantIds = Array.from(new Set(rows.map((row) => row.plantId).filter((value): value is string => Boolean(value))));
    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const plants = plantIds.length > 0 ? await plantRepo.find({ where: plantIds.map((id) => ({ id })), relations: { organization: true } }) : [];
    const plantMap = new Map(plants.map((plant) => [plant.id, plant]));
    const organizationName =
      (query.plantId ? plantMap.get(query.plantId ?? '')?.organization?.name : plants[0]?.organization?.name) ?? APP_NAME;
    const organizationLogoUrl =
      (query.plantId ? plantMap.get(query.plantId ?? '')?.organization?.logoUrl : plants[0]?.organization?.logoUrl) ?? null;
    const plantName = query.plantId ? plantMap.get(query.plantId ?? '')?.plantName ?? 'All Plants' : 'All Plants';
    const generatedAt = new Date().toISOString();
    const branding = await getReportBranding({
      organizationName,
      organizationLogoUrl,
      generatedAt,
      reportTitle: 'Gate Entry Report',
    });
    const brandedFooter = branding.footerBranding;
    const transportLogMap = new Map<string, GhgTransportLogEntity>();
    for (const item of transportLogs) {
      if (item.gateEntryId && !transportLogMap.has(item.gateEntryId)) {
        transportLogMap.set(item.gateEntryId, item);
      }
    }
    const vehicleMap = new Map<string, GateVehicleEntryEntity>();
    for (const item of vehicleRows) {
      if (item.gateEntryId && !vehicleMap.has(item.gateEntryId)) {
        vehicleMap.set(item.gateEntryId, item);
      }
    }
    const materialMap = new Map<string, GateMaterialEntryEntity>();
    for (const item of materialRows) {
      if (item.gateEntryId && !materialMap.has(item.gateEntryId)) {
        materialMap.set(item.gateEntryId, item);
      }
    }

    const reportRows = rows.map((row) => {
      const transportLog = transportLogMap.get(row.id);
      const vehicle = vehicleMap.get(row.id);
      const material = materialMap.get(row.id);
      return {
        gate: row.gate?.gateName ?? '-',
        gateCode: row.gate?.gateCode ?? '-',
        plant: row.plant?.plantName ?? '-',
        visitorType: row.visitorType,
        visitorName: row.visitorName,
        vehicleNumber: row.vehicleNumber ?? '-',
        status: row.status,
        entryTime: row.entryTime.toISOString(),
        exitTime: row.exitTime ? row.exitTime.toISOString() : '-',
        duplicate: row.duplicateDetected ? 'Yes' : 'No',
        blacklist: row.blacklistAlert ? 'Yes' : 'No',
        watchlist: row.watchlistAlert ? 'Yes' : 'No',
        passId: row.qrCodeValue ?? '-',
        transportMode: transportLog?.transportMode ?? vehicle?.transportMode ?? material?.transportMode ?? '-',
        emissionCategory: transportLog?.emissionCategory ?? material?.emissionCategory ?? vehicle?.emissionCategory ?? '-',
        estimatedCo2eKg: transportLog?.computedCo2eKg ?? material?.estimatedCo2eKg ?? vehicle?.estimatedCo2eKg ?? '0.000000',
        materialName: material?.materialName ?? row.materialDescription ?? '-',
      };
    });

    if (query.format === 'csv') {
      const csv = toCsv(
        ['Field', 'Value'],
        [
          ['Organization', organizationName],
          ['Organization Logo', organizationLogoUrl ?? '-'],
          ['Plant', plantName],
          ['Generated At', generatedAt],
          ['Footer Branding', brandedFooter],
          [],
          ['Gate', 'Gate ID', 'Plant', 'Visitor Type', 'Visitor Name', 'Vehicle Number', 'Status', 'Entry Time', 'Exit Time', 'Duplicate', 'Blacklist', 'Watchlist', 'Pass ID', 'Transport Mode', 'Emission Category', 'Estimated CO2e (kg)', 'Material'],
          ...reportRows.map((row) => [
            row.gate,
            row.gateCode,
            row.plant,
            row.visitorType,
            row.visitorName,
            row.vehicleNumber,
            row.status,
            row.entryTime,
            row.exitTime,
            row.duplicate,
            row.blacklist,
            row.watchlist,
            row.passId,
            row.transportMode,
            row.emissionCategory,
            row.estimatedCo2eKg,
            row.materialName,
          ]),
        ],
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="gate-report-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.status(200).send(csv);
      return;
    }

    if (query.format === 'excel') {
      const workbook = createSimpleExcelWorkbook('Gate Entry Report', [
        {
          name: 'Gate Entries',
          headers: ['Gate', 'Gate ID', 'Plant', 'Visitor Type', 'Visitor Name', 'Vehicle Number', 'Status', 'Entry Time', 'Exit Time', 'Duplicate', 'Blacklist', 'Watchlist', 'Pass ID', 'Transport Mode', 'Emission Category', 'Estimated CO2e (kg)', 'Material'],
          rows: reportRows.map((row) => [
            row.gate,
            row.gateCode,
            row.plant,
            row.visitorType,
            row.visitorName,
            row.vehicleNumber,
            row.status,
            row.entryTime,
            row.exitTime,
            row.duplicate,
            row.blacklist,
            row.watchlist,
            row.passId,
            row.transportMode,
            row.emissionCategory,
            row.estimatedCo2eKg,
            row.materialName,
          ]),
        },
      ], {
        organizationName,
        organizationLogoUrl,
        generatedAt,
        footerBranding: brandedFooter,
        
        
        
        
        
        
        
        
        
        
        
        
      });
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="gate-report-${new Date().toISOString().slice(0, 10)}.xls"`);
      res.status(200).send(workbook);
      return;
    }

    if (query.format === 'pdf') {
      const lines = [
        `Organization: ${organizationName}`,
        `Organization Logo: ${organizationLogoUrl ?? '-'}`,
        `Plant: ${plantName}`,
        `Report Date: ${new Date().toISOString().slice(0, 10)}`,
        '',
        ...reportRows.slice(0, 30).map((row) => `${row.entryTime} | ${row.gate} | ${row.visitorName} | ${row.visitorType} | ${row.status}`),
      ];
      const pdf = createSimplePdf(lines, {
        title: `${plantName} Gate Entry Report`,
        subtitle: organizationName,
        organizationLogoUrl,
        generatedAt,
        footerBranding: brandedFooter,
        
        
        
        
        
        
        
        
        
        
        
        
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="gate-report-${new Date().toISOString().slice(0, 10)}.pdf"`);
      res.status(200).send(pdf);
      return;
    }

    res.json(
      ok(
        {
          organizationName,
          plantName,
          reportDate: new Date().toISOString(),
          rows: reportRows,
          totals: {
            total: reportRows.length,
            activeVisitors: reportRows.filter((row) => row.status === 'IN').length,
            vehicles: reportRows.filter((row) => row.vehicleNumber !== '-').length,
            blacklistAlerts: reportRows.filter((row) => row.blacklist === 'Yes').length,
            watchlistAlerts: reportRows.filter((row) => row.watchlist === 'Yes').length,
            transportEmissionsKgCo2e: reportRows.reduce((sum, row) => sum + Number(row.estimatedCo2eKg || 0), 0),
          },
        },
        'Gate report fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});
