import { CrudRepository } from '../_core/crud.repository';

export const maintenanceTeamsRepository = new CrudRepository({
  moduleName: 'maintenanceTeams',
  moduleId: 'MASTERS',
  basePath: '/api/maintenance-teams',
  tableName: 'maintenance_teams',
  plantColumn: 'plant_id',
  searchColumns: ['team_name', 'discipline'],
  sortColumns: ['created_at', 'team_name', 'discipline'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
