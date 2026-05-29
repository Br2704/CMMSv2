import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { WorkOrderEntity } from './work-order.entity';
import { UserEntity } from './user.entity';

@Entity('work_order_verifications')
export class WorkOrderVerificationEntity extends TimestampedUuidEntity {
  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @Column({ name: 'approver_role', type: 'varchar' })
  approverRole!: string;

  @Column({ name: 'approver_id', type: 'uuid', nullable: true })
  approverId!: string | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  comments!: string | null;

  @Column({ name: 'digital_signature_hash', type: 'varchar', nullable: true })
  digitalSignatureHash!: string | null;

  @Column({ name: 'verified_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  verifiedAt!: Date | null;

  @ManyToOne(() => WorkOrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrderEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approver_id' })
  approver!: UserEntity | null;
}
