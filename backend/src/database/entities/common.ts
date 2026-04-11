import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { databaseSelection } from '../../config/database.selection';

const dbType = databaseSelection.engine;
const isMysqlFamily = dbType === 'mysql' || dbType === 'mariadb';
const isSqliteFamily = dbType === 'sqlite' || dbType === 'better-sqlite3';

export const DATETIME_COLUMN_TYPE = dbType === 'mssql' ? 'datetime2' : isSqliteFamily ? 'datetime' : 'timestamp';
export const LARGE_TEXT_COLUMN_TYPE = isMysqlFamily ? 'longtext' : dbType === 'mssql' ? 'ntext' : 'text';

export abstract class TimestampedUuidEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: DATETIME_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: DATETIME_COLUMN_TYPE })
  updatedAt!: Date;
}
