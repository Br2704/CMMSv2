import { Column, Entity, Index } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('security_events')
@Index('idx_security_events_detected', ['detectedAt'])
@Index('idx_security_events_severity_status', ['severity', 'status'])
export class SecurityEventEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'event_type', type: 'varchar' })
  eventType!: string;

  @Column({ type: 'varchar', default: 'MEDIUM' })
  severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ type: 'varchar', default: 'OPEN' })
  status!: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

  @Column({ type: 'varchar', nullable: true })
  module!: string | null;

  @Column({ type: 'varchar', nullable: true })
  action!: string | null;

  @Column({ type: 'varchar', nullable: true })
  path!: string | null;

  @Column({ type: 'text' })
  message!: string;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'detected_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  detectedAt!: Date;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedBy!: string | null;

  @Column({ name: 'acknowledged_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: 'resolved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null;
}
