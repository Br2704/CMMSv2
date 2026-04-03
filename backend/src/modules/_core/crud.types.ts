import type { ListQuery } from '../../utils/pagination';

export interface ModuleConfig {
  moduleName: string;
  moduleId: string;
  basePath: string;
  tableName: string;
  idColumn?: string;
  plantColumn?: string;
  searchColumns?: string[];
  sortColumns?: string[];
  defaultSort?: { column: string; direction: 'ASC' | 'DESC' };
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

export type ModuleListQuery = ListQuery;
export type GenericRecord = Record<string, unknown>;
