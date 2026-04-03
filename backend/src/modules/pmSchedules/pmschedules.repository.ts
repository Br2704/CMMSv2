import { CrudRepository } from '../_core/crud.repository';

export const pmschedulesRepository = new CrudRepository({
  moduleName: 'pmschedules',
  moduleId: 'PM_SCHEDULES',
  basePath: '/api/pm-schedules',
  tableName: 'pm_schedules',
  plantColumn: 'plant_id',
  searchColumns: ['frequency', 'status'],
  sortColumns: ['created_at', 'next_due', 'frequency', 'status'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
