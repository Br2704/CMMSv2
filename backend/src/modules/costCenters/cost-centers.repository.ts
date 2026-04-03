import { CrudRepository } from '../_core/crud.repository';

export const costCentersRepository = new CrudRepository({
  moduleName: 'costCenters',
  moduleId: 'MASTERS',
  basePath: '/api/cost-centers',
  tableName: 'cost_centers',
  plantColumn: 'plant_id',
  searchColumns: ['code', 'name'],
  sortColumns: ['created_at', 'code', 'name'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
