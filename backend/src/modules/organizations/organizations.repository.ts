
import { CrudRepository } from '../_core/crud.repository';

export const organizationsRepository = new CrudRepository({
  moduleName: 'organizations',
  moduleId: 'ORGANIZATIONS',
  basePath: '/api/organizations',
  tableName: 'organizations',
  searchColumns: ['name', 'code'],
  sortColumns: ['created_at', 'name', 'code'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
