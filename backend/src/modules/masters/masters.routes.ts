import { createCrudRouter } from '../_core/crud.routes';
import { mastersService } from './masters.service';
import { createMasterSchema, updateMasterSchema } from './masters.validators';

export const mastersRouter = createCrudRouter(
  {
    moduleName: 'masters',
    moduleId: 'MASTERS',
    basePath: '/api/masters',
    tableName: 'departments',
    plantColumn: 'plant_id',
  },
  mastersService,
  { createSchema: createMasterSchema, updateSchema: updateMasterSchema },
);
