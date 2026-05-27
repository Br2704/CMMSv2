import { CrudService } from '../_core/crud.service';
import { inventoryRepository } from './inventory.repository';

export const inventoryService = new CrudService(
  {
    moduleName: 'inventory',
    moduleId: 'INVENTORY',
    basePath: '/api/inventory',
    tableName: 'spare_items',
    plantColumn: 'plant_id',
    codeColumn: 'code',
    codeType: 'SP',
  },
  inventoryRepository,
);
