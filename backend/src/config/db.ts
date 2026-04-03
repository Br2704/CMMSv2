import type { DataSourceOptions } from 'typeorm';
import { env } from './env';

const common = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  synchronize: false,
  logging: env.NODE_ENV !== 'production',
};

let dbConfig: DataSourceOptions;

if (env.DB_TYPE === 'postgres') {
  dbConfig = {
    type: 'postgres',
    ...common,
    ssl: env.DB_SSL
      ? {
          rejectUnauthorized: false,
        }
      : false,
  };
} else if (env.DB_TYPE === 'mysql') {
  dbConfig = {
    type: 'mysql',
    ...common,
  };
} else {
  dbConfig = {
    type: 'mssql',
    ...common,
    options: {
      encrypt: env.DB_SSL,
      trustServerCertificate: true,
    },
  };
}

export { dbConfig };
