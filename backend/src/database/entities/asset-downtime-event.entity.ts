import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { PlantEntity } from './plant.entity';

@Entity('asset_downtime_events')
export class AssetDowntimeEventEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId!: string | null;

  @Column({ name: 'started_at', type: DATETIME_COLUMN_TYPE })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'is_failure_event', type: 'boolean', default: true })
  isFailureEvent!: boolean;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes!: number | null;

  @Column({ type: 'varchar', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;
}
