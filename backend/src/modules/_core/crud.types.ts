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

export interface CrudLikeService<TResult = any> {
  list(query: ListQuery, auth: Express.AuthContext): Promise<ListResult<TResult>>;
  getById(id: string, auth: Express.AuthContext): Promise<TResult>;
  create(input: any, auth: Express.AuthContext): Promise<TResult>;
  update(id: string, input: any, auth: Express.AuthContext): Promise<TResult>;
  remove(id: string, auth: Express.AuthContext): Promise<void>;
}

export type ModuleListQuery = ListQuery;
export type GenericRecord = Record<string, unknown>;
