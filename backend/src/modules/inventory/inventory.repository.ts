import { CrudRepository } from '../_core/crud.repository';

export const inventoryRepository = new CrudRepository({
  moduleName: 'inventory',
  moduleId: 'INVENTORY',
  basePath: '/api/inventory',
  tableName: 'spare_items',
  plantColumn: 'plant_id',
  searchColumns: ['code', 'name', 'category'],
  sortColumns: ['created_at', 'code', 'name', 'current_stock'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
