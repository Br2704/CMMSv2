import { CrudService } from '../_core/crud.service';
import { notificationsRepository } from './notifications.repository';

export const notificationsService = new CrudService(
  {
    moduleName: 'notifications',
    moduleId: 'NOTIFICATIONS',
    basePath: '/api/notifications',
    tableName: 'notifications',
    plantColumn: 'plant_id',
  },
  notificationsRepository,
);
