import { CrudService } from '../_core/crud.service';
import { esgRepository } from './esg.repository';

export const esgService = new CrudService(
  {
    moduleName: 'esg',
    moduleId: 'ESG',
    basePath: '/api/esg',
    tableName: 'esg_metrics',
    plantColumn: 'plant_id',
  },
  esgRepository,
);
