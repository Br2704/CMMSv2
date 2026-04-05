import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { GateEntryEntity } from './gate-entry.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';
import { VisitorSessionEntity } from './visitor-session.entity';

@Entity('visitor_tracking')
export class VisitorTrackingEntity extends TimestampedUuidEntity {
  @Column({ name: 'visitor_session_id', type: 'uuid' })
  visitorSessionId!: string;

  @Column({ name: 'gate_entry_id', type: 'uuid' })
  gateEntryId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'latitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ name: 'longitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({ name: 'node_id', type: 'varchar', nullable: true })
  nodeId!: string | null;

  @Column({ name: 'node_label', type: 'varchar', nullable: true })
  nodeLabel!: string | null;

  @Column({ name: 'geo_fence_status', type: 'varchar', default: 'WITHIN' })
  geoFenceStatus!: string;

  @Column({ name: 'alert_type', type: 'varchar', nullable: true })
  alertType!: string | null;

  @Column({ name: 'route_deviation', type: 'boolean', default: false })
  routeDeviation!: boolean;

  @Column({ name: 'source', type: 'varchar', default: 'GPS' })
  source!: string;

  @Column({ name: 'payload', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  payload!: string | null;

  @Column({ name: 'tracked_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  trackedAt!: Date;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy!: string | null;

  @ManyToOne(() => VisitorSessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visitor_session_id' })
  visitorSession!: VisitorSessionEntity;

  @ManyToOne(() => GateEntryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_entry_id' })
  gateEntry!: GateEntryEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recorded_by' })
  recordedByUser!: UserEntity | null;
}
