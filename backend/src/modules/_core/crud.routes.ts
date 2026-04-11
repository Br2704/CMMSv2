import { Router } from 'express';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requirePermission } from '../../middlewares/permissions';
import { validateRequest } from '../../middlewares/validate';
import { createCrudController } from './crud.controller';
import type { CrudLikeService, ModuleConfig } from './crud.types';
import { idParamSchema, listQuerySchema } from './crud.validators';

export function createCrudRouter(config: ModuleConfig, service: CrudLikeService, validators: { createSchema: unknown; updateSchema: unknown }) {
  const controller = createCrudController(service, config.moduleName);
  const router = Router();
  const basePath = config.basePath.startsWith('/api/') ? config.basePath.slice('/api'.length) : config.basePath;

  router.use(requireAuth);

  router.get(
    `${basePath}`,
    requirePermission(config.moduleId, 'READ'),
    validateRequest({ query: listQuerySchema }),
    controller.list,
  );
  router.get(`${basePath}/:id`, requirePermission(config.moduleId, 'READ'), validateRequest({ params: idParamSchema }), controller.getById);
  router.post(`${basePath}`, requirePermission(config.moduleId, 'CREATE'), validateRequest({ body: validators.createSchema as never }), controller.create);
  router.patch(
    `${basePath}/:id`,
    requirePermission(config.moduleId, 'UPDATE'),
    validateRequest({ params: idParamSchema, body: validators.updateSchema as never }),
    controller.update,
  );
  router.delete(`${basePath}/:id`, requirePermission(config.moduleId, 'DELETE'), validateRequest({ params: idParamSchema }), controller.remove);

  return router;
}
