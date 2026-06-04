import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';

@Entity('change_requests')
export class ChangeRequestEntity extends TimestampedUuidEntity {
  @Column({ name: 'module_type', type: 'varchar' })
  moduleType!: string; // 'PM_TEMPLATE', 'PD_TEMPLATE', 'CALIBRATION_TEMPLATE', 'LOG_TEMPLATE'

  @Column({ name: 'action_type', type: 'varchar' })
  actionType!: string; // 'CREATE', 'UPDATE', 'DELETE'

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'jsonb' })
  payload!: any;

  @Column({ type: 'varchar', default: 'PENDING_L1' })
  status!: string; // 'PENDING_L1', 'PENDING_L2', 'APPROVED', 'REJECTED', 'RETURNED'

  @Column({ name: 'submitted_by', type: 'uuid' })
  submittedBy!: string;

  @Column({ name: 'level_1_approver', type: 'uuid', nullable: true })
  level1Approver!: string | null;

  @Column({ name: 'level_2_approver', type: 'uuid', nullable: true })
  level2Approver!: string | null;

  @Column({ name: 'level_1_approved_at', type: 'timestamp', nullable: true })
  level1ApprovedAt!: Date | null;

  @Column({ name: 'level_2_approved_at', type: 'timestamp', nullable: true })
  level2ApprovedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  comments!: string | null;

  @Column({ name: 'version_number', type: 'int', default: 1 })
  versionNumber!: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submitted_by' })
  submitter!: UserEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'level_1_approver' })
  approverL1!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'level_2_approver' })
  approverL2!: UserEntity | null;
}
