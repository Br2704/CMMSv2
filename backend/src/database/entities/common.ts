import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const dbType = (process.env.DB_TYPE ?? 'postgres').toLowerCase();
export const DATETIME_COLUMN_TYPE = dbType === 'mssql' ? 'datetime2' : 'timestamp';
export const LARGE_TEXT_COLUMN_TYPE = dbType === 'mysql' ? 'longtext' : dbType === 'mssql' ? 'ntext' : 'text';

export abstract class TimestampedUuidEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: DATETIME_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: DATETIME_COLUMN_TYPE })
  updatedAt!: Date;
}
