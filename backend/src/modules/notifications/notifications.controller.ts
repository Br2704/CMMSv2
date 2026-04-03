import { createCrudController } from '../_core/crud.controller';
import { notificationsService } from './notifications.service';

export const notificationsController = createCrudController(notificationsService);
