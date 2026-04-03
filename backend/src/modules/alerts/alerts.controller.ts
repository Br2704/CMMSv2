
import { createCrudController } from '../_core/crud.controller';
import { alertsService } from './alerts.service';

export const alertsController = createCrudController(alertsService, 'alerts');
