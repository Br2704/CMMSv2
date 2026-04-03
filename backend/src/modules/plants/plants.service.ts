
import { CrudService } from '../_core/crud.service';
import { plantsRepository } from './plants.repository';

export const plantsService = new CrudService(
  {
    moduleName: 'plants',
    moduleId: 'PLANTS',
    basePath: '/api/plants',
    tableName: 'plants',
    plantColumn: 'id',
  },
  plantsRepository,
);
