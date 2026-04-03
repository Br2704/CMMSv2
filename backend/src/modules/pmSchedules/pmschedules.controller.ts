import { createCrudController } from '../_core/crud.controller';
import { pmschedulesService } from './pmschedules.service';

export const pmschedulesController = createCrudController(pmschedulesService);
