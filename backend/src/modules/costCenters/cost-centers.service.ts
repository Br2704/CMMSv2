import { CrudService } from '../_core/crud.service';
import { costCentersRepository } from './cost-centers.repository';

export const costCentersService = new CrudService(
  {
    moduleName: 'costCenters',
    moduleId: 'MASTERS',
    basePath: '/api/cost-centers',
    tableName: 'cost_centers',
    plantColumn: 'plant_id',
  },
  costCentersRepository,
);
