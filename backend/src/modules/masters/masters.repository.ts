import { CrudRepository } from '../_core/crud.repository';

export const mastersRepository = new CrudRepository({
  moduleName: 'masters',
  moduleId: 'MASTERS',
  basePath: '/api/masters',
  tableName: 'departments',
  plantColumn: 'plant_id',
  searchColumns: ['code', 'name'],
  sortColumns: ['created_at', 'code', 'name'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
