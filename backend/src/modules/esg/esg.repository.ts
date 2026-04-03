import { CrudRepository } from '../_core/crud.repository';

export const esgRepository = new CrudRepository({
  moduleName: 'esg',
  moduleId: 'ESG',
  basePath: '/api/esg',
  tableName: 'esg_metrics',
  plantColumn: 'plant_id',
  searchColumns: ['metric_name', 'category'],
  sortColumns: ['created_at', 'metric_name', 'category'],
  defaultSort: { column: 'created_at', direction: 'DESC' },
});
