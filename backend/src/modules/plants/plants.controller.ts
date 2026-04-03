
import { createCrudController } from '../_core/crud.controller';
import { plantsService } from './plants.service';

export const plantsController = createCrudController(plantsService);
