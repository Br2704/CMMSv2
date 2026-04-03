import { createCrudController } from '../_core/crud.controller';
import { calibrationService } from './calibration.service';

export const calibrationController = createCrudController(calibrationService, 'calibration');
