import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { LogTemplateEntity } from './log-template.entity';
import { UserEntity } from './user.entity';

@Entity('log_template_users')
@Unique('uq_log_template_assignment', ['templateId', 'userId'])
export class LogTemplateAssignmentEntity extends TimestampedUuidEntity {
  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => LogTemplateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: LogTemplateEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;
}
