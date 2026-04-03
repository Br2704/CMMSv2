import { Column, Entity } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('asset_reliability_kpis')
export class AssetReliabilityKpiEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'window_start', type: DATETIME_COLUMN_TYPE })
  windowStart!: Date;

  @Column({ name: 'window_end', type: DATETIME_COLUMN_TYPE })
  windowEnd!: Date;

  @Column({ name: 'failures', type: 'int', default: 0 })
  failures!: number;

  @Column({ name: 'downtime_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 })
  downtimeMinutes!: string;

  @Column({ name: 'uptime_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 })
  uptimeMinutes!: string;

  @Column({ name: 'mttr_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 })
  mttrMinutes!: string;

  @Column({ name: 'mtbf_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 })
  mtbfMinutes!: string;

  @Column({ name: 'mttf_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 })
  mttfMinutes!: string;

  @Column({ name: 'snapshot_meta', type: 'simple-json', nullable: true })
  snapshotMeta!: Record<string, unknown> | null;
}
