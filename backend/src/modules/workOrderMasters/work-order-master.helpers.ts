import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { WorkOrderMasterEntity } from '../../database/entities';
import { DEFAULT_WORK_ORDER_MASTER_OPTIONS } from './work-order-master.defaults';

function buildDefaultRows(plantId: string) {
  return DEFAULT_WORK_ORDER_MASTER_OPTIONS.map((item) => ({
    id: randomUUID(),
    plantId,
    optionType: item.optionType,
    code: item.code,
    label: item.label,
    description: item.description ?? null,
    sortOrder: item.sortOrder,
    isActive: true,
  }));
}

export async function ensureDefaultWorkOrderMasters(
  plantIds: Array<string | null | undefined>,
  manager: EntityManager = AppDataSource.manager,
): Promise<void> {
  const uniquePlantIds = Array.from(new Set(plantIds.filter((plantId): plantId is string => Boolean(plantId))));
  if (uniquePlantIds.length === 0) {
    return;
  }

  const repository = manager.getRepository(WorkOrderMasterEntity);
  const existing = await repository.find({
    where: { plantId: In(uniquePlantIds) },
    select: ['plantId'],
  });
  const existingPlantIds = new Set(existing.map((item) => item.plantId));
  const missingPlantIds = uniquePlantIds.filter((plantId) => !existingPlantIds.has(plantId));
  if (missingPlantIds.length === 0) {
    return;
  }

  const rows = missingPlantIds.flatMap((plantId) => buildDefaultRows(plantId));
  if (rows.length === 0) {
    return;
  }

  await manager.createQueryBuilder().insert().into(WorkOrderMasterEntity).values(rows).orIgnore().execute();
}
