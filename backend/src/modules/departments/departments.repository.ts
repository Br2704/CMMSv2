
import { CrudRepository } from '../_core/crud.repository';

export const departmentsRepository = new CrudRepository({
  moduleName: 'departments',
  moduleId: 'DEPARTMENTS',
  basePath: '/api/departments',
  tableName: 'departments',
  searchColumns: ['name', 'code'],
  sortColumns: ['created_at', 'name', 'code'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
