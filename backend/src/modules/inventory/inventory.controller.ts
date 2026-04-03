import { createCrudController } from '../_core/crud.controller';
import { inventoryService } from './inventory.service';

export const inventoryController = createCrudController(inventoryService);
