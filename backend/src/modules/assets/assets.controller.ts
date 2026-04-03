import { createCrudController } from '../_core/crud.controller';
import { assetsService } from './assets.service';

export const assetsController = createCrudController(assetsService, 'assets');
