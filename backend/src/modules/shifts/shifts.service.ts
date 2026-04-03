import { CrudService } from '../_core/crud.service';
import { shiftsRepository } from './shifts.repository';

export const shiftsService = new CrudService(
  {
    moduleName: 'shifts',
    moduleId: 'MASTERS',
    basePath: '/api/shifts',
    tableName: 'shifts',
    plantColumn: 'plant_id',
  },
  shiftsRepository,
);
