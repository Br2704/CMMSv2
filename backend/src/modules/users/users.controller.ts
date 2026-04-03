import { createCrudController } from '../_core/crud.controller';
import { usersService } from './users.service';

export const usersController = createCrudController(usersService, 'users');
