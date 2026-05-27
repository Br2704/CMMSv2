import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { MaintenanceReportEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { resolvePlantFilter } from '../../utils/plantScope';

export const maintenanceReportsRouter = Router();
maintenanceReportsRouter.use(requireAuth);

maintenanceReportsRouter.get('/', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const list = parseListQuery(req.query as Record<string, unknown>);
    const plantIds = resolvePlantFilter(req.auth!, req.query.plantId as string);

    const qb = AppDataSource.getRepository(MaintenanceReportEntity)
      .createQueryBuilder('report')
      .where('1=1');

    if (plantIds && plantIds.length > 0) {
      qb.andWhere('report.plant_id IN (:...plantIds)', { plantIds });
    } else if (plantIds && plantIds.length === 0) {
      return res.json(ok([], 'No plants accessible', buildPagination(list.page, list.limit, 0)));
    }

    if (req.query.search) {
      qb.andWhere('(report.wo_number ILIKE :search OR report.asset_name ILIKE :search OR report.problem_description ILIKE :search)', {
        search: `%${req.query.search}%`,
      });
    }

    const [items, total] = await qb
      .orderBy('report.closure_date', 'DESC')
      .skip((list.page - 1) * list.limit)
      .take(list.limit)
      .getManyAndCount();

    res.json(ok(items, 'Maintenance reports fetched', buildPagination(list.page, list.limit, total)));
  } catch (error) {
    next(error);
  }
});

maintenanceReportsRouter.get('/:id', requirePermission('REPORTS', 'READ'), async (req, res, next) => {
  try {
    const report = await AppDataSource.getRepository(MaintenanceReportEntity).findOne({
      where: { id: req.params.id },
      relations: ['workOrder', 'asset', 'plant'],
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    ensurePlantAccess(req, report.plantId);
    res.json(ok(report, 'Maintenance report detail fetched'));
  } catch (error) {
    next(error);
  }
});
