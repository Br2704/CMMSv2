import { Column, Entity, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('esg_monthly_summaries')
@Unique('uq_esg_monthly_summaries_plant_period_metric', ['plantId', 'year', 'month', 'metricCode'])
export class EsgMonthlySummaryEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'metric_code', type: 'varchar' })
  metricCode!: string;

  @Column({ name: 'metric_label', type: 'varchar' })
  metricLabel!: string;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  value!: string;

  @Column({ name: 'value_source', type: 'varchar', default: 'DAILY' })
  valueSource!: string;
}
