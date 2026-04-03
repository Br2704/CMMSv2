
import { createCrudRouter } from '../_core/crud.routes';
import { departmentsService } from './departments.service';
import { createDepartmentSchema, updateDepartmentSchema } from './departments.validators';

export const departmentsRouter = createCrudRouter(
  {
    moduleName: 'departments',
    moduleId: 'DEPARTMENTS',
    basePath: '/api/departments',
    tableName: 'departments',
  },
  departmentsService,
  {
    createSchema: createDepartmentSchema,
    updateSchema: updateDepartmentSchema,
  },
);
