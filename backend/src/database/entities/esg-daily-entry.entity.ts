import { Column, Entity, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('esg_daily_entries')
@Unique('uq_esg_daily_entries_plant_date_metric', ['plantId', 'entryDate', 'metricCode'])
export class EsgDailyEntryEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate!: string;

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

  @Column({ type: 'varchar', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
