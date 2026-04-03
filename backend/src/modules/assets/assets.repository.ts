import { CrudRepository } from '../_core/crud.repository';

export const assetsRepository = new CrudRepository({
  moduleName: 'assets',
  moduleId: 'ASSETS',
  basePath: '/api/assets',
  tableName: 'assets',
  plantColumn: 'plant_id',
  searchColumns: ['code', 'name', 'type', 'status'],
  sortColumns: ['created_at', 'code', 'name', 'status'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
