import { CrudRepository } from '../_core/crud.repository';

export const shiftsRepository = new CrudRepository({
  moduleName: 'shifts',
  moduleId: 'MASTERS',
  basePath: '/api/shifts',
  tableName: 'shifts',
  plantColumn: 'plant_id',
  searchColumns: ['shift_name', 'start_time', 'end_time'],
  sortColumns: ['created_at', 'shift_name', 'start_time'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
