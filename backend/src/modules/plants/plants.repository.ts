
import { CrudRepository } from '../_core/crud.repository';

export const plantsRepository = new CrudRepository({
  moduleName: 'plants',
  moduleId: 'PLANTS',
  basePath: '/api/plants',
  tableName: 'plants',
  searchColumns: ['plantCode', 'plantName', 'location'],
  sortColumns: ['created_at', 'plantCode', 'plantName'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
