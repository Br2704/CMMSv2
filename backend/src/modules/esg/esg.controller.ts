import { createCrudController } from '../_core/crud.controller';
import { esgService } from './esg.service';

export const esgController = createCrudController(esgService);
