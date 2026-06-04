import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { WarrantyAlertEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ok, fail } from '../../utils/apiResponse';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { activePlantId } = req.auth!;
    const repo = AppDataSource.getRepository(WarrantyAlertEntity);
    const alerts = await repo.find({
      where: activePlantId ? { plantId: activePlantId } : {},
      relations: ['machine', 'closer'],
      order: { createdAt: 'DESC' }
    });
    res.json(ok(alerts, 'Warranty alerts fetched successfully'));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/close', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const { userId } = req.auth!;

    if (!remarks) {
      res.status(400).json(fail('Remarks are required to close an alert'));
      return;
    }

    const repo = AppDataSource.getRepository(WarrantyAlertEntity);
    const alert = await repo.findOne({ where: { id } });

    if (!alert) {
      res.status(404).json(fail('Alert not found'));
      return;
    }

    if (alert.status === 'CLOSED') {
      res.status(400).json(fail('Alert is already closed'));
      return;
    }

    alert.status = 'CLOSED';
    alert.remarks = remarks;
    alert.closedBy = userId;
    alert.closedAt = new Date();

    await repo.save(alert);
    res.json(ok(alert, 'Alert closed successfully'));
  } catch (error) {
    next(error);
  }
});

export default router;
