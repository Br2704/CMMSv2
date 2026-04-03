import { CrudService } from '../_core/crud.service';
import { mastersRepository } from './masters.repository';

export const mastersService = new CrudService(
  {
    moduleName: 'masters',
    moduleId: 'MASTERS',
    basePath: '/api/masters',
    tableName: 'departments',
    plantColumn: 'plant_id',
  },
  mastersRepository,
);
