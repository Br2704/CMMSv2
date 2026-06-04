import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity, DATETIME_COLUMN_TYPE } from './common';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';

@Entity('machine_failure_code_mappings')
@Unique(['machineId', 'failureCategory', 'failureCode'])
export class MachineFailureCodeMappingEntity extends TimestampedUuidEntity {
  @Column({ name: 'machine_id', type: 'uuid' })
  machineId!: string;

  @Column({ name: 'failure_category', type: 'varchar' })
  failureCategory!: string;

  @Column({ name: 'failure_code', type: 'varchar' })
  failureCode!: string;

  @Column({ type: 'varchar', default: 'PENDING' }) // PENDING, APPROVED, REJECTED
  status!: string;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy!: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  approvedAt!: Date | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'machine_id' })
  machine!: AssetEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by' })
  requester!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approver!: UserEntity | null;
}
