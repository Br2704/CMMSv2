import { createCrudController } from '../_core/crud.controller';
import { safetyService } from './safety.service';

export const safetyController = createCrudController(safetyService, 'safety');
