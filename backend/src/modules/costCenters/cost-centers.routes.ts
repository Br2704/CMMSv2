import { createCrudRouter } from '../_core/crud.routes';
import { costCentersService } from './cost-centers.service';
import { createCostCenterSchema, updateCostCenterSchema } from './cost-centers.validators';

export const costCentersRouter = createCrudRouter(
  {
    moduleName: 'costCenters',
    moduleId: 'MASTERS',
    basePath: '/api/cost-centers',
    tableName: 'cost_centers',
    plantColumn: 'plant_id',
  },
  costCentersService,
  {
    createSchema: createCostCenterSchema,
    updateSchema: updateCostCenterSchema,
  },
);
