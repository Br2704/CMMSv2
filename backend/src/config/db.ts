import type { DataSourceOptions } from 'typeorm';
import { databaseSelection, type DatabaseEngine } from './database.selection';
import { env } from './env';

const commonOptions = {
  synchronize: env.NODE_ENV !== 'production',
  logging: env.NODE_ENV !== 'production',
} as const;

type RelationalType = Extract<DatabaseEngine, 'postgres' | 'cockroachdb' | 'mysql' | 'mariadb' | 'mssql'>;

const selectedEngine = databaseSelection.engine;
const selectedDatabaseName = databaseSelection.databaseName;

function withDatabaseNameInUrl(url: string, databaseName: string) {
  try {
    const parsed = new URL(url);
    parsed.pathname = `/${encodeURIComponent(databaseName)}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

function buildRelationalConnectionConfig() {
  if (env.DATABASE_URL) {
    return {
      url: withDatabaseNameInUrl(env.DATABASE_URL, selectedDatabaseName),
    };
  }

  return {
    host: env.DB_HOST!,
    port: env.DB_PORT!,
    username: env.DB_USER!,
    password: env.DB_PASSWORD,
    database: selectedDatabaseName,
  };
}

function buildSqliteDatabasePath() {
  if (env.DB_FILE) return env.DB_FILE;

  const fallbackName = `${selectedDatabaseName.replace(/[^a-zA-Z0-9._-]+/g, '_')}.sqlite`;

  if (env.DATABASE_URL) {
    try {
      const parsed = new URL(env.DATABASE_URL);
      const pathFromUrl = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
      if (pathFromUrl) return pathFromUrl;
    } catch {
      // env validation handles invalid URL format.
    }
  }

  return fallbackName;
}

function buildRelationalConfig(type: RelationalType): DataSourceOptions {
  const connection = buildRelationalConnectionConfig();

  if (type === 'postgres' || type === 'cockroachdb') {
    return {
      type,
      ...commonOptions,
      ...connection,
      ssl: env.DB_SSL
        ? {
            rejectUnauthorized: false,
          }
        : false,
    } as DataSourceOptions;
  }

  if (type === 'mysql' || type === 'mariadb') {
    return {
      type,
      ...commonOptions,
      ...connection,
    } as DataSourceOptions;
  }

  return {
    type: 'mssql',
    ...commonOptions,
    ...connection,
    options: {
      encrypt: env.DB_SSL,
      trustServerCertificate: true,
    },
  } as DataSourceOptions;
}

let dbConfig: DataSourceOptions;

if (selectedEngine === 'sqlite' || selectedEngine === 'better-sqlite3') {
  dbConfig = {
    type: selectedEngine,
    ...commonOptions,
    database: buildSqliteDatabasePath(),
  };
} else if (selectedEngine === 'mongodb') {
  dbConfig = {
    type: 'mongodb',
    ...commonOptions,
    ...(env.DATABASE_URL
      ? { url: withDatabaseNameInUrl(env.DATABASE_URL, selectedDatabaseName) }
      : {
          host: env.DB_HOST!,
          port: env.DB_PORT!,
          username: env.DB_USER!,
          password: env.DB_PASSWORD,
          database: selectedDatabaseName,
        }),
  } as DataSourceOptions;
} else {
  dbConfig = buildRelationalConfig(selectedEngine);
}

export { dbConfig };
