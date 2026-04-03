import { createCrudController } from '../_core/crud.controller';
import { gatesService } from './gates.service';

export const gatesController = createCrudController(gatesService);
