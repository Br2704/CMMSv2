import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { DepartmentEntity } from './department.entity';
import { GateEntryTypeEntity } from './gate-entry-type.entity';

@Entity('gate_template_users')
export class GateTemplateUserEntity extends TimestampedUuidEntity {
  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @Column({ name: 'allowed_user_type', type: 'varchar' })
  allowedUserType!: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'approval_required', type: 'boolean', default: false })
  approvalRequired!: boolean;

  @ManyToOne(() => GateEntryTypeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: GateEntryTypeEntity;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;
}
