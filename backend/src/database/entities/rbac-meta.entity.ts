import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { DATETIME_COLUMN_TYPE } from './common';

@Entity('rbac_meta')
export class RbacMetaEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: DATETIME_COLUMN_TYPE })
  updatedAt!: Date;
}

