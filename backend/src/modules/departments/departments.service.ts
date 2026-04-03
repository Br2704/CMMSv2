
import { CrudService } from '../_core/crud.service';
import { departmentsRepository } from './departments.repository';

export const departmentsService = new CrudService(
  {
    moduleName: 'departments',
    moduleId: 'DEPARTMENTS',
    basePath: '/api/departments',
    tableName: 'departments',
    plantColumn: 'plant_id',
  },
  departmentsRepository,
);
