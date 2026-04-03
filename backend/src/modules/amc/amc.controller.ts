import { createCrudController } from '../_core/crud.controller';
import { amcService } from './amc.service';

export const amcController = createCrudController(amcService, 'amc');
