import { createCrudController } from '../_core/crud.controller';
import { mastersService } from './masters.service';

export const mastersController = createCrudController(mastersService);
