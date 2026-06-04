import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { ChangeRequestEntity } from './change-request.entity';

@Entity('record_revisions')
export class RecordRevisionEntity extends TimestampedUuidEntity {
  @Column({ name: 'module_type', type: 'varchar' })
  moduleType!: string;

  @Column({ name: 'reference_id', type: 'uuid' })
  referenceId!: string;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  @Column({ type: 'jsonb' })
  payload!: any;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy!: string | null;

  @Column({ name: 'change_request_id', type: 'uuid', nullable: true })
  changeRequestId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'changed_by' })
  changedByUser!: UserEntity | null;

  @ManyToOne(() => ChangeRequestEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'change_request_id' })
  changeRequest!: ChangeRequestEntity | null;
}
