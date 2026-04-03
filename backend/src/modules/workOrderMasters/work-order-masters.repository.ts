import { CrudRepository } from '../_core/crud.repository';

export const workOrderMastersRepository = new CrudRepository({
  moduleName: 'workOrderMasters',
  moduleId: 'MASTERS',
  basePath: '/api/work-order-masters',
  tableName: 'work_order_masters',
  plantColumn: 'plant_id',
  searchColumns: ['code', 'label', 'description'],
  sortColumns: ['created_at', 'option_type', 'sort_order', 'label', 'code'],
  defaultSort: { column: 'sort_order', direction: 'ASC' },
});
