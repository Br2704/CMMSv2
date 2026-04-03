
import { CrudService } from '../_core/crud.service';
import { alertsRepository } from './alerts.repository';

export const alertsService = new CrudService(
  {
    moduleName: 'alerts',
    moduleId: 'ALERTS',
    basePath: '/api/alerts/config',
    tableName: 'alerts_config',
    plantColumn: 'plant_id',
  },
  alertsRepository,
);
