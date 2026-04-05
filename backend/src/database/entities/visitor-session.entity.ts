import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { GateEntryEntity } from './gate-entry.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('visitor_sessions')
export class VisitorSessionEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_entry_id', type: 'uuid' })
  gateEntryId!: string;

  @Column({ name: 'visitor_user_id', type: 'uuid', nullable: true })
  visitorUserId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'session_token', type: 'varchar', unique: true })
  sessionToken!: string;

  @Column({ name: 'mobile_number', type: 'varchar', nullable: true })
  mobileNumber!: string | null;

  @Column({ name: 'start_time', type: DATETIME_COLUMN_TYPE })
  startTime!: Date;

  @Column({ name: 'end_time', type: DATETIME_COLUMN_TYPE })
  endTime!: Date;

  @Column({ name: 'status', type: 'varchar', default: 'PENDING' })
  status!: string;

  @Column({ name: 'approval_status', type: 'varchar', default: 'PENDING' })
  approvalStatus!: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy!: string | null;

  @Column({ name: 'rejected_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'last_latitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLatitude!: string | null;

  @Column({ name: 'last_longitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLongitude!: string | null;

  @Column({ name: 'last_node_id', type: 'varchar', nullable: true })
  lastNodeId!: string | null;

  @Column({ name: 'last_node_label', type: 'varchar', nullable: true })
  lastNodeLabel!: string | null;

  @Column({ name: 'last_seen_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: 'notes', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => GateEntryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_entry_id' })
  gateEntry!: GateEntryEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'visitor_user_id' })
  visitorUser!: UserEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rejected_by' })
  rejectedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
