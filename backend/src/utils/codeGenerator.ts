import { AppDataSource } from '../database/data-source';
import { OrganizationEntity, PlantEntity } from '../database/entities';

const SEQUENCE_LENGTH = 4;
const MAX_TOKEN_LENGTH = 8;

function normalizeToken(value: string | null | undefined, fallback: string): string {
  const raw = String(value ?? '').trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9]+/g, '');
  if (cleaned.length === 0) {
    return fallback;
  }
  return cleaned.slice(0, MAX_TOKEN_LENGTH);
}

function buildPrefix(orgCode: string, plantCode: string, typeCode: string): string {
  return `${orgCode}${plantCode}${typeCode}`;
}

function padSequence(sequence: number): string {
  return String(sequence).padStart(SEQUENCE_LENGTH, '0');
}

function extractSequence(candidate: string, prefix: string): number | null {
  if (!candidate.startsWith(prefix)) return null;
  const suffix = candidate.slice(prefix.length);
  const match = suffix.match(/(\d{4})$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolveOrgPlantTokens(plantId?: string | null, organizationId?: string | null) {
  let orgCode = 'ORG';
  let plantCode = 'GLOBAL';

  if (plantId) {
    const plantRepo = AppDataSource.getRepository(PlantEntity);
    const plant = await plantRepo.findOne({ where: { id: plantId }, select: ['id', 'plantCode', 'organizationId'] });
    if (plant?.plantCode) {
      plantCode = normalizeToken(plant.plantCode, 'PLANT');
    }
    const orgId = plant?.organizationId ?? organizationId ?? null;
    if (orgId) {
      const orgRepo = AppDataSource.getRepository(OrganizationEntity);
      const org = await orgRepo.findOne({ where: { id: orgId }, select: ['id', 'code', 'name'] });
      orgCode = normalizeToken(org?.code ?? org?.name ?? null, 'ORG');
    }
    return { orgCode, plantCode };
  }

  if (organizationId) {
    const orgRepo = AppDataSource.getRepository(OrganizationEntity);
    const org = await orgRepo.findOne({ where: { id: organizationId }, select: ['id', 'code', 'name'] });
    orgCode = normalizeToken(org?.code ?? org?.name ?? null, 'ORG');
  }

  return { orgCode, plantCode };
}

function resolveColumnName(tableName: string, propertyOrColumn: string): string {
  const metadata = AppDataSource.entityMetadatas.find((item) => item.tableName === tableName) ?? null;
  if (!metadata) {
    return propertyOrColumn;
  }
  const column = metadata.columns.find(
    (candidate) =>
      candidate.propertyName === propertyOrColumn ||
      candidate.databaseName === propertyOrColumn,
  );
  return column?.databaseName ?? propertyOrColumn;
}

function resolvePropertyName(tableName: string, propertyOrColumn: string): string {
  const metadata = AppDataSource.entityMetadatas.find((item) => item.tableName === tableName) ?? null;
  if (!metadata) {
    return propertyOrColumn;
  }
  const column = metadata.columns.find(
    (candidate) =>
      candidate.propertyName === propertyOrColumn ||
      candidate.databaseName === propertyOrColumn,
  );
  return column?.propertyName ?? propertyOrColumn;
}

export type CodeScope = {
  plantColumn?: string;
  plantId?: string | null;
  organizationColumn?: string;
  organizationId?: string | null;
};

export async function ensureUniqueCode(params: {
  tableName: string;
  codeColumn: string;
  code: string;
  scope?: CodeScope;
  excludeId?: string;
}): Promise<boolean> {
  const codeColumn = resolveColumnName(params.tableName, params.codeColumn);
  const qb = AppDataSource.createQueryBuilder().select('t.id').from(params.tableName, 't');
  qb.where(`LOWER(TRIM(t.${codeColumn})) = :code`, { code: params.code.trim().toLowerCase() });

  if (params.excludeId) {
    qb.andWhere('t.id <> :excludeId', { excludeId: params.excludeId });
  }

  if (params.scope?.plantColumn && params.scope.plantId) {
    const plantColumn = resolveColumnName(params.tableName, params.scope.plantColumn);
    qb.andWhere(`t.${plantColumn} = :plantId`, { plantId: params.scope.plantId });
  }

  if (params.scope?.organizationColumn && params.scope.organizationId) {
    const orgColumn = resolveColumnName(params.tableName, params.scope.organizationColumn);
    qb.andWhere(`t.${orgColumn} = :organizationId`, { organizationId: params.scope.organizationId });
  }

  const existing = await qb.getRawOne();
  return Boolean(existing);
}

export async function generateEntityCode(params: {
  tableName: string;
  codeColumn: string;
  typeCode: string;
  plantId?: string | null;
  organizationId?: string | null;
  scope?: CodeScope;
}): Promise<string> {
  const codeColumn = resolveColumnName(params.tableName, params.codeColumn);
  const { orgCode, plantCode } = await resolveOrgPlantTokens(params.plantId ?? null, params.organizationId ?? null);
  const typeCode = normalizeToken(params.typeCode, 'GEN');
  const prefix = buildPrefix(orgCode, plantCode, typeCode);

  const qb = AppDataSource.createQueryBuilder().select(`t.${codeColumn}`, 'code').from(params.tableName, 't');
  qb.where(`LOWER(t.${codeColumn}) LIKE :prefix`, { prefix: `${prefix.toLowerCase()}%` });

  if (params.scope?.plantColumn && params.scope.plantId) {
    const plantColumn = resolveColumnName(params.tableName, params.scope.plantColumn);
    qb.andWhere(`t.${plantColumn} = :plantId`, { plantId: params.scope.plantId });
  }

  if (params.scope?.organizationColumn && params.scope.organizationId) {
    const orgColumn = resolveColumnName(params.tableName, params.scope.organizationColumn);
    qb.andWhere(`t.${orgColumn} = :organizationId`, { organizationId: params.scope.organizationId });
  }

  const rows = await qb.getRawMany<{ code?: string }>();
  let maxSequence = 0;
  rows.forEach((row) => {
    if (!row.code || typeof row.code !== 'string') return;
    const seq = extractSequence(row.code.toUpperCase(), prefix);
    if (seq && seq > maxSequence) {
      maxSequence = seq;
    }
  });

  return `${prefix}${padSequence(maxSequence + 1)}`;
}

export function resolvePayloadCode(params: {
  tableName: string;
  codeColumn: string;
  input: Record<string, unknown>;
}): string | null {
  const propertyName = resolvePropertyName(params.tableName, params.codeColumn);
  const raw = params.input[propertyName] ?? params.input[params.codeColumn];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function applyPayloadCode(params: {
  tableName: string;
  codeColumn: string;
  input: Record<string, unknown>;
  code: string;
}) {
  const propertyName = resolvePropertyName(params.tableName, params.codeColumn);
  params.input[propertyName] = params.code;
  params.input[params.codeColumn] = params.code;
}
