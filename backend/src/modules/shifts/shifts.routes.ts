import { createCrudRouter } from '../_core/crud.routes';
import { shiftsService } from './shifts.service';
import { createShiftSchema, updateShiftSchema } from './shifts.validators';

export const shiftsRouter = createCrudRouter(
  {
    moduleName: 'shifts',
    moduleId: 'MASTERS',
    basePath: '/api/shifts',
    tableName: 'shifts',
    plantColumn: 'plant_id',
  },
  shiftsService,
  {
    createSchema: createShiftSchema,
    updateSchema: updateShiftSchema,
  },
);
