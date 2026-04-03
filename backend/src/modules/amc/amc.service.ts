import { CrudService } from '../_core/crud.service';
import { amcRepository } from './amc.repository';

export const amcService = new CrudService(
  {
    moduleName: 'amc',
    moduleId: 'AMC',
    basePath: '/api/amc',
    tableName: 'amc_contracts',
    plantColumn: 'plant_id',
  },
  amcRepository,
);
