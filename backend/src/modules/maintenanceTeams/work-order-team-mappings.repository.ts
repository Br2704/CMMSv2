import { CrudRepository } from '../_core/crud.repository';

export const workOrderTeamMappingsRepository = new CrudRepository({
  moduleName: 'workOrderTeamMappings',
  moduleId: 'MASTERS',
  basePath: '/api/work-order-team-mappings',
  tableName: 'work_order_team_mappings',
  plantColumn: 'plant_id',
  searchColumns: ['category'],
  sortColumns: ['created_at', 'category'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
