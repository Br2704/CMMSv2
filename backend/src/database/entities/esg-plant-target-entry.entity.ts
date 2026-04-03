import { Column, Entity, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('esg_plant_target_entries')
@Unique('uq_esg_plant_target_entries_scope', ['plantId', 'year', 'metricCode'])
export class EsgPlantTargetEntryEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ name: 'metric_code', type: 'varchar' })
  metricCode!: string;

  @Column({ name: 'metric_label', type: 'varchar' })
  metricLabel!: string;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ name: 'target_value', type: 'decimal', precision: 18, scale: 6, default: 0 })
  targetValue!: string;

  @Column({ type: 'varchar', nullable: true })
  notes!: string | null;
}
