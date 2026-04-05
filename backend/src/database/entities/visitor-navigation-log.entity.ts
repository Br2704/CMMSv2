import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { GateEntryEntity } from './gate-entry.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('visitor_navigation_logs')
export class VisitorNavigationLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_entry_id', type: 'uuid' })
  gateEntryId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'node_id', type: 'varchar', nullable: true })
  nodeId!: string | null;

  @Column({ name: 'node_label', type: 'varchar', nullable: true })
  nodeLabel!: string | null;

  @Column({ name: 'latitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ name: 'longitude', type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({ name: 'check_in_mode', type: 'varchar', default: 'MANUAL' })
  checkInMode!: string;

  @Column({ name: 'occurred_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  occurredAt!: Date;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy!: string | null;

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
