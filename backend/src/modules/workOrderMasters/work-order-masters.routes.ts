import { createCrudRouter } from '../_core/crud.routes';
import { workOrderMastersService } from './work-order-masters.service';
import { createWorkOrderMasterSchema, updateWorkOrderMasterSchema } from './work-order-masters.validators';

export const workOrderMastersRouter = createCrudRouter(
  {
    moduleName: 'workOrderMasters',
    moduleId: 'MASTERS',
    basePath: '/api/work-order-masters',
    tableName: 'work_order_masters',
    plantColumn: 'plant_id',
  },
  workOrderMastersService,
  {
    createSchema: createWorkOrderMasterSchema,
    updateSchema: updateWorkOrderMasterSchema,
  },
);
