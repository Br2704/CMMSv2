import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { GateEntryEntity } from './gate-entry.entity';
import { GateEntity } from './gate.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('gate_exit_logs')
export class GateExitLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_entry_id', type: 'uuid' })
  gateEntryId!: string;

  @Column({ name: 'gate_id', type: 'uuid' })
  gateId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'exit_time', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  exitTime!: Date;

  @Column({ name: 'exit_method', type: 'varchar', default: 'MANUAL' })
  exitMethod!: string;

  @Column({ name: 'exit_approved_by', type: 'uuid', nullable: true })
  exitApprovedBy!: string | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @ManyToOne(() => GateEntryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_entry_id' })
  gateEntry!: GateEntryEntity;

  @ManyToOne(() => GateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_id' })
  gate!: GateEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'exit_approved_by' })
  exitApprovedByUser!: UserEntity | null;
}
