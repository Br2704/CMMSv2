
import { CrudService } from '../_core/crud.service';
import { organizationsRepository } from './organizations.repository';

export const organizationsService = new CrudService(
  {
    moduleName: 'organizations',
    moduleId: 'ORGANIZATIONS',
    basePath: '/api/organizations',
    tableName: 'organizations',
    codeColumn: 'code',
    codeType: 'ORG',
  },
  organizationsRepository,
);
