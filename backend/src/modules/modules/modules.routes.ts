import { Router } from 'express';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireAnyPermission, requirePermission } from '../../middlewares/permissionGuard';
import { validateRequest } from '../../middlewares/validate';
import { modulesController } from './modules.controller';
import {
  createModuleSchema,
  moduleIdParamSchema,
  moduleListQuerySchema,
  updateModuleSchema,
} from './modules.validators';

export const modulesRouter = Router();

modulesRouter.use(requireAuth);

modulesRouter.get(
  '/',
  requireAnyPermission([
    { moduleId: 'MODULES', action: 'READ' },
    { moduleId: 'ASSETS', action: 'READ' },
    { moduleId: 'WORK_ORDERS', action: 'READ' },
    { moduleId: 'INVENTORY', action: 'READ' },
    { moduleId: 'PM', action: 'READ' },
    { moduleId: 'CALIBRATION', action: 'READ' },
    { moduleId: 'LOGS', action: 'READ' },
  ]),
  validateRequest({ query: moduleListQuerySchema }),
  modulesController.list,
);

modulesRouter.post(
  '/',
  requirePermission('MODULES', 'CREATE'),
  validateRequest({ body: createModuleSchema }),
  modulesController.create,
);

modulesRouter.patch(
  '/:id',
  requirePermission('MODULES', 'UPDATE'),
  validateRequest({ params: moduleIdParamSchema, body: updateModuleSchema }),
  modulesController.update,
);

modulesRouter.delete(
  '/:id',
  requirePermission('MODULES', 'DELETE'),
  validateRequest({ params: moduleIdParamSchema }),
  modulesController.remove,
);
