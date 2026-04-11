import mysql from 'mysql2/promise';
import { databaseSelection } from '../config/database.selection';
import { env } from '../config/env';
import { logger } from '../config/logger';

const sql = require('mssql') as any;
const pg = require('pg') as { Client: new (options: Record<string, unknown>) => any };

function quotePostgresIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteMysqlIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

function quoteMssqlIdentifier(identifier: string) {
  return `[${identifier.replace(/]/g, ']]')}]`;
}

function normalizeDatabaseNameForLog(databaseName: string) {
  return databaseName.trim();
}

function withDatabaseNameInUrl(url: string, databaseName: string) {
  try {
    const parsed = new URL(url);
    parsed.pathname = `/${encodeURIComponent(databaseName)}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

async function ensurePostgresLikeDatabaseExists() {
  const databaseName = databaseSelection.databaseName;
  const engine = databaseSelection.engine;
  const maintenanceDatabase = engine === 'cockroachdb' ? 'defaultdb' : 'postgres';

  const client = env.DATABASE_URL
    ? new pg.Client({
        connectionString: withDatabaseNameInUrl(env.DATABASE_URL, maintenanceDatabase),
        ssl: env.DB_SSL
          ? {
              rejectUnauthorized: false,
            }
          : false,
      })
    : new pg.Client({
        host: env.DB_HOST!,
        port: env.DB_PORT!,
        user: env.DB_USER!,
        password: env.DB_PASSWORD,
        database: maintenanceDatabase,
        ssl: env.DB_SSL
          ? {
              rejectUnauthorized: false,
            }
          : false,
      });

  await client.connect();

  try {
    if (engine === 'cockroachdb') {
      await client.query(`CREATE DATABASE IF NOT EXISTS ${quotePostgresIdentifier(databaseName)}`);
      return;
    }

    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1', [databaseName]);
    if (existing.rowCount && existing.rowCount > 0) {
      return;
    }

    await client.query(`CREATE DATABASE ${quotePostgresIdentifier(databaseName)}`);
  } finally {
    await client.end();
  }
}

async function ensureMysqlLikeDatabaseExists() {
  const databaseName = databaseSelection.databaseName;

  const connection = env.DATABASE_URL
    ? await mysql.createConnection(withDatabaseNameInUrl(env.DATABASE_URL, 'mysql'))
    : await mysql.createConnection({
        host: env.DB_HOST!,
        port: env.DB_PORT!,
        user: env.DB_USER!,
        password: env.DB_PASSWORD,
        ssl: env.DB_SSL
          ? {
              rejectUnauthorized: false,
            }
          : undefined,
      });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteMysqlIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}

async function ensureMssqlDatabaseExists() {
  const databaseName = databaseSelection.databaseName;
  const escapedName = databaseName.replace(/'/g, "''");

  const config = env.DATABASE_URL
    ? (() => {
        const parsed = new URL(env.DATABASE_URL);
        return {
          server: parsed.hostname,
          port: parsed.port ? Number(parsed.port) : 1433,
          user: decodeURIComponent(parsed.username || ''),
          password: decodeURIComponent(parsed.password || ''),
          database: 'master',
          options: {
            encrypt: env.DB_SSL,
            trustServerCertificate: true,
          },
        };
      })()
    : {
        server: env.DB_HOST!,
        port: env.DB_PORT!,
        user: env.DB_USER!,
        password: env.DB_PASSWORD,
        database: 'master',
        options: {
          encrypt: env.DB_SSL,
          trustServerCertificate: true,
        },
      };

  const pool = await sql.connect(config);
  try {
    await pool
      .request()
      .query(`IF DB_ID(N'${escapedName}') IS NULL BEGIN CREATE DATABASE ${quoteMssqlIdentifier(databaseName)} END`);
  } finally {
    await pool.close();
  }
}

export async function ensureSelectedDatabaseExists() {
  if (!databaseSelection.autoCreateDatabase) {
    return;
  }

  const databaseName = normalizeDatabaseNameForLog(databaseSelection.databaseName);
  if (!databaseName) {
    throw new Error('databaseSelection.databaseName must not be empty.');
  }

  const engine = databaseSelection.engine;
  if (engine === 'sqlite' || engine === 'better-sqlite3' || engine === 'mongodb') {
    return;
  }

  if (engine === 'postgres' || engine === 'cockroachdb') {
    await ensurePostgresLikeDatabaseExists();
    logger.info({ engine, databaseName }, 'Database ensured');
    return;
  }

  if (engine === 'mysql' || engine === 'mariadb') {
    await ensureMysqlLikeDatabaseExists();
    logger.info({ engine, databaseName }, 'Database ensured');
    return;
  }

  if (engine === 'mssql') {
    await ensureMssqlDatabaseExists();
    logger.info({ engine, databaseName }, 'Database ensured');
    return;
  }
}
