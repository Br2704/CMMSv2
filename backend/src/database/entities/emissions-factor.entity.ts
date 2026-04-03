import { Column, Entity } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('emissions_factors')
export class EmissionsFactorEntity extends TimestampedUuidEntity {
  @Column({ name: 'factor_key', type: 'varchar' })
  factorKey!: string;

  @Column({ type: 'varchar' })
  unit!: string;

  @Column({ type: 'decimal', precision: 14, scale: 6 })
  value!: string;

  @Column({ name: 'valid_from', type: DATETIME_COLUMN_TYPE })
  validFrom!: Date;

  @Column({ name: 'valid_to', type: DATETIME_COLUMN_TYPE, nullable: true })
  validTo!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  region!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
