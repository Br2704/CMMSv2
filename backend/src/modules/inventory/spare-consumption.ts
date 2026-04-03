import { In, type EntityManager } from 'typeorm';
import { SpareItemEntity } from '../../database/entities';
import { badRequest } from '../../utils/httpError';

export interface SpareUsageEntry {
  spareItemId: string;
  quantity: number;
  spareName?: string | null;
  spareCode?: string | null;
}

type SpareUsageScope = {
  plantId?: string | null;
  assetId?: string | null;
};

function parseJsonValue(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function parseJsonObject(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    const parsed = parseJsonValue(input);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return {};
}

export function stringifyJsonObject(input: Record<string, unknown>): string {
  return JSON.stringify(input);
}

export function normalizeSpareUsage(input: unknown): SpareUsageEntry[] {
  const source = typeof input === 'string' ? parseJsonValue(input) : input;
  if (!Array.isArray(source)) return [];

  const merged = new Map<string, SpareUsageEntry>();
  for (const row of source) {
    if (!row || typeof row !== 'object') continue;
    const entry = row as Record<string, unknown>;
    const spareItemIdRaw = entry.spareItemId ?? entry.spare_item_id;
    const quantityRaw = entry.quantity;
    const spareNameRaw = entry.spareName ?? entry.spare_name;
    const spareCodeRaw = entry.spareCode ?? entry.spare_code;

    if (typeof spareItemIdRaw !== 'string' || spareItemIdRaw.trim().length === 0) continue;
    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const spareItemId = spareItemIdRaw.trim();
    const existing = merged.get(spareItemId);
    const normalized: SpareUsageEntry = {
      spareItemId,
      quantity: (existing?.quantity ?? 0) + Math.floor(quantity),
      spareName: typeof spareNameRaw === 'string' && spareNameRaw.trim().length > 0 ? spareNameRaw.trim() : existing?.spareName ?? null,
      spareCode: typeof spareCodeRaw === 'string' && spareCodeRaw.trim().length > 0 ? spareCodeRaw.trim() : existing?.spareCode ?? null,
    };
    merged.set(spareItemId, normalized);
  }

  return Array.from(merged.values());
}

function usageDelta(previousUsage: SpareUsageEntry[], nextUsage: SpareUsageEntry[]) {
  const delta = new Map<string, number>();
  previousUsage.forEach((entry) => {
    delta.set(entry.spareItemId, (delta.get(entry.spareItemId) ?? 0) - entry.quantity);
  });
  nextUsage.forEach((entry) => {
    delta.set(entry.spareItemId, (delta.get(entry.spareItemId) ?? 0) + entry.quantity);
  });
  return delta;
}

export async function applySpareUsageDelta(
  manager: EntityManager,
  previousUsage: SpareUsageEntry[],
  nextUsage: SpareUsageEntry[],
  scope: SpareUsageScope = {},
) {
  const delta = usageDelta(previousUsage, nextUsage);
  const ids = Array.from(delta.keys());
  if (ids.length === 0) {
    return new Map<string, SpareItemEntity>();
  }

  const repo = manager.getRepository(SpareItemEntity);
  const items = await repo.findBy({ id: In(ids) });
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const spareItemId of ids) {
    const spareItem = byId.get(spareItemId);
    if (!spareItem || !spareItem.isActive) {
      badRequest('Selected spare item is invalid or inactive');
    }
    if (scope.plantId && spareItem.plantId && spareItem.plantId !== scope.plantId) {
      badRequest('Selected spare item does not belong to the current plant');
    }
    if (scope.assetId && spareItem.assetId && spareItem.assetId !== scope.assetId) {
      badRequest('Selected spare item does not belong to the current machine');
    }
  }

  for (const [spareItemId, qtyDelta] of delta.entries()) {
    const spareItem = byId.get(spareItemId)!;
    if (qtyDelta > 0) {
      if (spareItem.currentStock < qtyDelta) {
        badRequest(`Insufficient stock for ${spareItem.code} - ${spareItem.name}`);
      }
      spareItem.currentStock -= qtyDelta;
    } else if (qtyDelta < 0) {
      spareItem.currentStock += Math.abs(qtyDelta);
    }
  }

  await repo.save(Array.from(byId.values()));
  return byId;
}

export function formatSpareUsageSummary(entries: SpareUsageEntry[]) {
  if (entries.length === 0) return null;
  return entries
    .map((entry) => {
      const label = [entry.spareCode, entry.spareName].filter(Boolean).join(' - ') || entry.spareItemId;
      return `${label} x ${entry.quantity}`;
    })
    .join('\n');
}
