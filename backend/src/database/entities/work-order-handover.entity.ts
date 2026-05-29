import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { WorkOrderEntity } from './work-order.entity';
import { UserEntity } from './user.entity';
import { ShiftEntity } from './shift.entity';

@Entity('work_order_handovers')
export class WorkOrderHandoverEntity extends TimestampedUuidEntity {
  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @Column({ name: 'from_shift_id', type: 'uuid', nullable: true })
  fromShiftId!: string | null;

  @Column({ name: 'to_shift_id', type: 'uuid', nullable: true })
  toShiftId!: string | null;

  @Column({ name: 'handover_notes', type: 'text', nullable: true })
  handoverNotes!: string | null;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedBy!: string | null;

  @Column({ name: 'acknowledged_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  acknowledgedAt!: Date | null;

  @ManyToOne(() => WorkOrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrderEntity;

  @ManyToOne(() => ShiftEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'from_shift_id' })
  fromShift!: ShiftEntity | null;

  @ManyToOne(() => ShiftEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'to_shift_id' })
  toShift!: ShiftEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acknowledged_by' })
  acknowledgingUser!: UserEntity | null;
}
