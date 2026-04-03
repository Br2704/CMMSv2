import { Column, Entity, Unique } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('esg_kpi_results')
@Unique('uq_esg_kpi_results_plant_period_name', ['plantId', 'year', 'month', 'kpiName'])
export class EsgKpiResultEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'kpi_name', type: 'varchar' })
  kpiName!: string;

  @Column({ name: 'kpi_category', type: 'varchar' })
  kpiCategory!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  value!: string;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ name: 'target_value', type: 'decimal', precision: 18, scale: 6, nullable: true })
  targetValue!: string | null;

  @Column({ type: 'varchar', default: 'ON_TRACK' })
  status!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  variance!: string | null;

  @Column({ name: 'calculated_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  calculatedAt!: Date;
}
