import { CrudService } from '../_core/crud.service';
import { usersRepository } from './users.repository';

export const usersService = new CrudService(
  {
    moduleName: 'users',
    moduleId: 'USERS',
    basePath: '/api/users',
    tableName: 'users',
    plantColumn: 'plant_id',
  },
  usersRepository,
);
