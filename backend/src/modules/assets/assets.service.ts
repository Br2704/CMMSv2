import { CrudService } from '../_core/crud.service';
import { assetsRepository } from './assets.repository';

export const assetsService = new CrudService(
  {
    moduleName: 'assets',
    moduleId: 'ASSETS',
    basePath: '/api/assets',
    tableName: 'assets',
    plantColumn: 'plant_id',
  },
  assetsRepository,
);
