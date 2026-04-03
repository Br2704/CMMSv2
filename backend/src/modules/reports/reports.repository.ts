import { CrudRepository } from '../_core/crud.repository';

export const reportsRepository = new CrudRepository({
  moduleName: 'reports',
  moduleId: 'REPORTS',
  basePath: '/api/reports',
  tableName: 'email_report_schedules',
  plantColumn: 'plant_id',
  searchColumns: ['report_name', 'frequency'],
  sortColumns: ['created_at', 'report_name', 'frequency'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
