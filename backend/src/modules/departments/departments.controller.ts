
import { createCrudController } from '../_core/crud.controller';
import { departmentsService } from './departments.service';

export const departmentsController = createCrudController(departmentsService);
