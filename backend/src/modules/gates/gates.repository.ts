import { CrudRepository } from '../_core/crud.repository';

export const gatesRepository = new CrudRepository({
  moduleName: 'gates',
  moduleId: 'GATES',
  basePath: '/api/gates',
  tableName: 'gate_entries',
  plantColumn: 'plant_id',
  searchColumns: ['visitor_name', 'visitor_company', 'vehicle_number', 'status'],
  sortColumns: ['created_at', 'entry_time', 'status'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
