import { createCrudController } from '../_core/crud.controller';
import { workordersService } from './workorders.service';

export const workordersController = createCrudController(workordersService, 'workorders');
