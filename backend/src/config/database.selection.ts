export const SUPPORTED_DATABASE_ENGINES = [
  'postgres',
  'mysql',
  'mariadb',
  'mssql',
  'cockroachdb',
  'sqlite',
  'better-sqlite3',
  'mongodb',
] as const;

export type DatabaseEngine = (typeof SUPPORTED_DATABASE_ENGINES)[number];

export type DatabaseSelectionConfig = {
  engine: DatabaseEngine;
  databaseName: string;
  autoCreateDatabase: boolean;
};

// Central place to choose database engine + default application database name.
export const databaseSelection: DatabaseSelectionConfig = {
  engine: 'postgres',
  databaseName: 'TamOptiX CMMS',
  autoCreateDatabase: true,
};
