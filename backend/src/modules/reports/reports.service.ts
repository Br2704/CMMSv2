import { CrudService } from '../_core/crud.service';
import { reportsRepository } from './reports.repository';

export const reportsService = new CrudService(
  {
    moduleName: 'reports',
    moduleId: 'REPORTS',
    basePath: '/api/reports',
    tableName: 'email_report_schedules',
    plantColumn: 'plant_id',
  },
  reportsRepository,
);
