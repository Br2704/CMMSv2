import { CrudRepository } from '../_core/crud.repository';

export const notificationsRepository = new CrudRepository({
  moduleName: 'notifications',
  moduleId: 'NOTIFICATIONS',
  basePath: '/api/notifications',
  tableName: 'notifications',
  plantColumn: 'plant_id',
  searchColumns: ['title', 'message', 'status'],
  sortColumns: ['created_at', 'status', 'title'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
