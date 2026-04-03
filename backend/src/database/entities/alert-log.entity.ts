import { Column, Entity, VersionColumn } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('alerts_log')
export class AlertLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'asset_id', type: 'uuid', nullable: true })
  assetId!: string | null;

  @Column({ name: 'metric_key', type: 'varchar' })
  metricKey!: string;

  @Column({ name: 'actual_value', type: 'decimal', precision: 18, scale: 6 })
  actualValue!: string;

  @Column({ name: 'threshold_value', type: 'decimal', precision: 18, scale: 6 })
  thresholdValue!: string;

  @Column({ name: 'comparison_type', type: 'varchar' })
  comparisonType!: '>' | '<' | '>=' | '<=';

  @Column({ type: 'varchar', default: 'MEDIUM' })
  severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ name: 'triggered_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  triggeredAt!: Date;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedBy!: string | null;

  @Column({ name: 'acknowledged_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ name: 'resolved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'varchar', default: 'OPEN' })
  status!: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;
}
