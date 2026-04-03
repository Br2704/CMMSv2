import { CrudRepository } from '../_core/crud.repository';

export const workordersRepository = new CrudRepository({
  moduleName: 'workorders',
  moduleId: 'WORK_ORDERS',
  basePath: '/api/work-orders',
  tableName: 'work_orders',
  plantColumn: 'plant_id',
  searchColumns: ['wo_number', 'status', 'category', 'priority'],
  sortColumns: ['created_at', 'wo_number', 'status', 'priority'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
