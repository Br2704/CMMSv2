import { Router } from 'express';
import { createCrudRouter } from '../_core/crud.routes';
import {
  createMaintenanceTeamSchema,
  createWorkOrderTeamMappingSchema,
  updateMaintenanceTeamSchema,
  updateWorkOrderTeamMappingSchema,
} from './maintenance-teams.validators';
import { maintenanceTeamsService } from './maintenance-teams.service';
import { workOrderTeamMappingsService } from './work-order-team-mappings.service';

const maintenanceTeamsCrudRouter = createCrudRouter(
  {
    moduleName: 'maintenanceTeams',
    moduleId: 'MASTERS',
    basePath: '/api/maintenance-teams',
    tableName: 'maintenance_teams',
    plantColumn: 'plant_id',
  },
  maintenanceTeamsService,
  {
    createSchema: createMaintenanceTeamSchema,
    updateSchema: updateMaintenanceTeamSchema,
  },
);

const workOrderTeamMappingsCrudRouter = createCrudRouter(
  {
    moduleName: 'workOrderTeamMappings',
    moduleId: 'MASTERS',
    basePath: '/api/work-order-team-mappings',
    tableName: 'work_order_team_mappings',
    plantColumn: 'plant_id',
  },
  workOrderTeamMappingsService,
  {
    createSchema: createWorkOrderTeamMappingSchema,
    updateSchema: updateWorkOrderTeamMappingSchema,
  },
);

export const maintenanceTeamsRouter = Router();
maintenanceTeamsRouter.use(maintenanceTeamsCrudRouter);
maintenanceTeamsRouter.use(workOrderTeamMappingsCrudRouter);
