import { CrudRepository } from '../_core/crud.repository';

export const safetyRepository = new CrudRepository({
  moduleName: 'safety',
  moduleId: 'SAFETY',
  basePath: '/api/safety',
  tableName: 'safety_incidents',
  plantColumn: 'plant_id',
  searchColumns: ['incident_number', 'incident_type', 'severity', 'status'],
  sortColumns: ['created_at', 'incident_date', 'severity', 'status'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
