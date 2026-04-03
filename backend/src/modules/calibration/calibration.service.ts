import { CrudService } from '../_core/crud.service';
import { calibrationRepository } from './calibration.repository';

export const calibrationService = new CrudService(
  {
    moduleName: 'calibration',
    moduleId: 'CALIBRATION',
    basePath: '/api/calibration',
    tableName: 'calibration_records',
    plantColumn: 'plant_id',
  },
  calibrationRepository,
);
