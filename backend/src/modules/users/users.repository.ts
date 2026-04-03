import { CrudRepository } from '../_core/crud.repository';

export const usersRepository = new CrudRepository({
  moduleName: 'users',
  moduleId: 'USERS',
  basePath: '/api/users',
  tableName: 'users',
  plantColumn: 'plant_id',
  searchColumns: ['email', 'full_name'],
  sortColumns: ['created_at', 'email', 'full_name'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
