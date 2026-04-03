import { createCrudRouter } from '../_core/crud.routes';
import { workordersService } from './workorders.service';
import { createWorkOrderSchema, updateWorkOrderSchema } from './workorders.validators';

export const workordersRouter = createCrudRouter(
  {
    moduleName: 'workorders',
    moduleId: 'WORK_ORDERS',
    basePath: '/api/work-orders',
    tableName: 'work_orders',
    plantColumn: 'plant_id',
  },
  workordersService,
  {
    createSchema: createWorkOrderSchema,
    updateSchema: updateWorkOrderSchema,
  },
);
