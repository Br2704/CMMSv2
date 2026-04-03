import { Column, Entity, Unique, VersionColumn } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('alerts_config')
@Unique('uq_alerts_config_scope', ['plantId', 'assetType', 'metricKey', 'comparisonType'])
export class AlertConfigEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'asset_type', type: 'varchar', nullable: true })
  assetType!: string | null;

  @Column({ name: 'metric_key', type: 'varchar' })
  metricKey!: string;

  @Column({ name: 'threshold_value', type: 'decimal', precision: 18, scale: 6 })
  thresholdValue!: string;

  @Column({ name: 'comparison_type', type: 'varchar' })
  comparisonType!: '>' | '<' | '>=' | '<=';

  @Column({ type: 'varchar', default: 'MEDIUM' })
  severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ name: 'notify_roles', type: 'simple-json', default: '[]' })
  notifyRoles!: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;
}
