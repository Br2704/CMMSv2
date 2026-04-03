import { CrudRepository } from '../_core/crud.repository';

export const calibrationRepository = new CrudRepository({
  moduleName: 'calibration',
  moduleId: 'CALIBRATION',
  basePath: '/api/calibration',
  tableName: 'calibration_records',
  plantColumn: 'plant_id',
  searchColumns: ['certificate_number', 'status', 'remarks'],
  sortColumns: ['created_at', 'next_due_date', 'status'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
