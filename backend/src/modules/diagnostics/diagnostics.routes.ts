import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, AssetPerformanceLogEntity, DepartmentEntity, MachineModuleEntity, WorkOrderEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { safeNumber } from '../../utils/advancedAnalytics';

type OrphanCount = {
  label: string;
  count: number;
};

async function queryOrphans() {
  const rows: OrphanCount[] = [];

  const [assetsMissingPlant, assetsMissingDepartment, assetsMissingModule] = await Promise.all([
    AppDataSource.getRepository(AssetEntity)
      .createQueryBuilder('asset')
      .leftJoin('plants', 'plant', 'plant.id = asset.plant_id')
      .where('asset.is_active = :active', { active: true })
      .andWhere('(asset.plant_id IS NULL OR plant.id IS NULL)')
      .getCount(),
    AppDataSource.getRepository(AssetEntity)
      .createQueryBuilder('asset')
      .leftJoin('departments', 'department', 'department.id = asset.department_id')
      .where('asset.is_active = :active', { active: true })
      .andWhere('(asset.department_id IS NULL OR department.id IS NULL)')
      .getCount(),
    AppDataSource.getRepository(AssetEntity)
      .createQueryBuilder('asset')
      .leftJoin('machine_modules', 'module', 'module.id = asset.module_id')
      .where('asset.is_active = :active', { active: true })
      .andWhere('(asset.module_id IS NULL OR module.id IS NULL)')
      .getCount(),
  ]);

  rows.push({ label: 'assets_missing_plant', count: assetsMissingPlant });
  rows.push({ label: 'assets_missing_department', count: assetsMissingDepartment });
  rows.push({ label: 'assets_missing_module', count: assetsMissingModule });
  return rows;
}

async function queryInconsistencies() {
  const [negativeRuntimeCount, negativeEnergyCount] = await Promise.all([
    AppDataSource.getRepository(AssetPerformanceLogEntity)
      .createQueryBuilder('log')
      .where('log.is_active = :active', { active: true })
      .andWhere('CAST(log.runtime_hours AS decimal(18,6)) < 0')
      .getCount(),
    AppDataSource.getRepository(AssetPerformanceLogEntity)
      .createQueryBuilder('log')
      .where('log.is_active = :active', { active: true })
      .andWhere('CAST(log.energy_kwh AS decimal(18,6)) < 0')
      .getCount(),
  ]);

  const downtimeBeyondResolutionCount = await AppDataSource.getRepository(WorkOrderEntity)
    .createQueryBuilder('wo')
    .where('wo.is_failure_event = true')
    .andWhere('wo.downtime_start_at IS NOT NULL')
    .andWhere('wo.downtime_end_at IS NOT NULL')
    .andWhere('wo.downtime_end_at < wo.downtime_start_at')
    .getCount();

  return [
    { label: 'negative_runtime_rows', count: negativeRuntimeCount },
    { label: 'negative_energy_rows', count: negativeEnergyCount },
    { label: 'invalid_downtime_order', count: downtimeBeyondResolutionCount },
  ];
}

export const diagnosticsRouter = Router();
diagnosticsRouter.use('/diagnostics', requireAuth, requireRole(['SUPERADMIN']), requirePermission('REPORTS', 'READ'));

diagnosticsRouter.get('/diagnostics/system-health', async (_req, res, next) => {
  try {
    const ping = await AppDataSource.query('SELECT 1 as ok');
    const dbHealthy = Array.isArray(ping) && ping.length > 0;

    const [orphans, inconsistencies, counts] = await Promise.all([
      queryOrphans(),
      queryInconsistencies(),
      Promise.all([
        AppDataSource.getRepository(AssetEntity).count({ where: { isActive: true } }),
        AppDataSource.getRepository(DepartmentEntity).count({ where: { isActive: true } }),
        AppDataSource.getRepository(MachineModuleEntity).count({ where: { isActive: true } }),
      ]),
    ]);

    const totalOrphans = orphans.reduce((acc, row) => acc + row.count, 0);
    const totalInconsistencies = inconsistencies.reduce((acc, row) => acc + row.count, 0);

    res.json(
      ok({
        dbHealth: dbHealthy ? 'UP' : 'DOWN',
        checkedAt: new Date(),
        counts: {
          activeAssets: counts[0],
          activeDepartments: counts[1],
          activeModules: counts[2],
        },
        orphanRecordsCount: totalOrphans,
        orphanBreakdown: orphans,
        dataInconsistenciesCount: totalInconsistencies,
        inconsistenciesBreakdown: inconsistencies,
      }),
    );
  } catch (error) {
    next(error);
  }
});

diagnosticsRouter.get('/diagnostics/reconciliation', async (_req, res, next) => {
  try {
    const rows = await AppDataSource.getRepository(AssetPerformanceLogEntity)
      .createQueryBuilder('log')
      .select([
        `TO_CHAR(log.captured_at, 'YYYY-MM-DD') AS "day"`,
        'log.asset_id AS "assetId"',
        'SUM(CAST(log.runtime_hours AS decimal(18,6))) AS "runtimeHours"',
        'SUM(CAST(log.energy_kwh AS decimal(18,6))) AS "energyKwh"',
      ])
      .where('log.is_active = :active', { active: true })
      .groupBy(`TO_CHAR(log.captured_at, 'YYYY-MM-DD')`)
      .addGroupBy('log.asset_id')
      .getRawMany<{ day: string; assetId: string; runtimeHours: string | null; energyKwh: string | null }>();

    const flags = rows
      .map((row) => {
        const runtime = safeNumber(row.runtimeHours);
        const energy = safeNumber(row.energyKwh);
        const totalHoursPerDay = 24;
        const issues: string[] = [];
        if (runtime > totalHoursPerDay) issues.push('runtime_exceeds_24h');
        if (runtime === 0 && energy > 0) issues.push('energy_without_runtime');
        return { ...row, runtimeHours: runtime, energyKwh: energy, issues };
      })
      .filter((row) => row.issues.length > 0);

    res.json(ok({ totalFlags: flags.length, flags }, 'Data reconciliation completed'));
  } catch (error) {
    next(error);
  }
});
