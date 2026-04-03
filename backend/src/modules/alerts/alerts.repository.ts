
import { CrudRepository } from '../_core/crud.repository';

export const alertsRepository = new CrudRepository({
  moduleName: 'alerts',
  moduleId: 'ALERTS',
  basePath: '/api/alerts/config',
  tableName: 'alerts_config',
  searchColumns: ['metricKey', 'severity'],
  sortColumns: ['created_at', 'metricKey', 'severity'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
