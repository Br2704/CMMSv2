import { CrudService } from '../_core/crud.service';
import { gatesRepository } from './gates.repository';

export const gatesService = new CrudService(
  {
    moduleName: 'gates',
    moduleId: 'GATES',
    basePath: '/api/gates',
    tableName: 'gate_entries',
    plantColumn: 'plant_id',
  },
  gatesRepository,
);
