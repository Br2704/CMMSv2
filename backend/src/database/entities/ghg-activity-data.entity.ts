import { Column, Entity } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('ghg_activity_data')
export class GhgActivityDataEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'source_type', type: 'varchar' })
  sourceType!: string;

  @Column({ name: 'scope_category', type: 'varchar', default: 'SCOPE_2' })
  scopeCategory!: 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3';

  @Column({ type: 'decimal', precision: 14, scale: 3 })
  quantity!: string;

  @Column({ type: 'varchar' })
  unit!: string;

  @Column({ name: 'period_start', type: DATETIME_COLUMN_TYPE })
  periodStart!: Date;

  @Column({ name: 'period_end', type: DATETIME_COLUMN_TYPE })
  periodEnd!: Date;

  @Column({ name: 'computed_co2e', type: 'decimal', precision: 14, scale: 6, default: 0 })
  computedCo2e!: string;

  @Column({ name: 'production_output', type: 'decimal', precision: 14, scale: 3, nullable: true })
  productionOutput!: string | null;

  @Column({ name: 'factor_used', type: 'varchar', nullable: true })
  factorUsed!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
