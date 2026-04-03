import { CrudService } from '../_core/crud.service';
import { safetyRepository } from './safety.repository';

export const safetyService = new CrudService(
  {
    moduleName: 'safety',
    moduleId: 'SAFETY',
    basePath: '/api/safety',
    tableName: 'safety_incidents',
    plantColumn: 'plant_id',
  },
  safetyRepository,
);
