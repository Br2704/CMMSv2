import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { DepartmentEntity } from './department.entity';
import { PlantEntity } from './plant.entity';
import { ShiftEntity } from './shift.entity';
import { UserEntity } from './user.entity';

@Entity('shift_handovers')
export class ShiftHandoverEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'shift_id', type: 'uuid' })
  shiftId!: string;

  @Column({ name: 'pending_wo_count', type: 'int', default: 0 })
  pendingWoCount!: number;

  @Column({ name: 'pending_pm_count', type: 'int', default: 0 })
  pendingPmCount!: number;

  @Column({ name: 'pending_pd_count', type: 'int', default: 0 })
  pendingPdCount!: number;

  @Column({ name: 'pending_logs_count', type: 'int', default: 0 })
  pendingLogsCount!: number;

  @Column({ name: 'machine_status_summary', type: 'jsonb', nullable: true })
  machineStatusSummary!: any;

  @Column({ name: 'follow_up_actions', type: 'text', nullable: true })
  followUpActions!: string | null;

  @Column({ name: 'handed_over_by', type: 'uuid' })
  handedOverBy!: string;

  @Column({ name: 'received_by', type: 'uuid', nullable: true })
  receivedBy!: string | null;

  @Column({ type: 'varchar', default: 'PENDING_RECEIPT' })
  status!: string; // 'PENDING_RECEIPT', 'COMPLETED'

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => ShiftEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shift_id' })
  shift!: ShiftEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'handed_over_by' })
  handedOverByUser!: UserEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'received_by' })
  receivedByUser!: UserEntity | null;
}
