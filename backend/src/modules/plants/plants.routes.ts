
import { createCrudRouter } from '../_core/crud.routes';
import { plantsService } from './plants.service';
import { createPlantSchema, updatePlantSchema } from './plants.validators';

export const plantsRouter = createCrudRouter(
  {
    moduleName: 'plants',
    moduleId: 'PLANTS',
    basePath: '/api/plants',
    tableName: 'plants',
  },
  plantsService,
  {
    createSchema: createPlantSchema,
    updateSchema: updatePlantSchema,
  },
);
