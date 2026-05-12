import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { WorkOrderEntity } from './work-order.entity';

@Entity('notifications')
@Index('idx_notifications_user_unread', ['userId', 'isRead'])
export class NotificationEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', default: 'info' })
  type!: string;

  @Column({ type: 'varchar', nullable: true })
  category!: string | null;

  @Column({ name: 'group_key', type: 'varchar', nullable: true })
  groupKey!: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ type: 'varchar', nullable: true })
  link!: string | null;

  @Column({ name: 'wo_id', type: 'uuid', nullable: true })
  woId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => WorkOrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wo_id' })
  workOrder!: WorkOrderEntity | null;
}
