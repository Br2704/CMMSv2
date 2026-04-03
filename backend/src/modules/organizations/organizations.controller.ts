
import { createCrudController } from '../_core/crud.controller';
import { organizationsService } from './organizations.service';

export const organizationsController = createCrudController(organizationsService);
