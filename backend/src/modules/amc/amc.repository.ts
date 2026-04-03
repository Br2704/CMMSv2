import { CrudRepository } from '../_core/crud.repository';

export const amcRepository = new CrudRepository({
  moduleName: 'amc',
  moduleId: 'AMC',
  basePath: '/api/amc',
  tableName: 'amc_contracts',
  plantColumn: 'plant_id',
  searchColumns: ['contract_number', 'status', 'terms'],
  sortColumns: ['created_at', 'start_date', 'end_date', 'status'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
