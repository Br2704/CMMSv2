import { createCrudController } from '../_core/crud.controller';
import { reportsService } from './reports.service';

export const reportsController = createCrudController(reportsService);
