import { Column, Entity, Index } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('notification_settings')
@Index('idx_notif_settings_user', ['userId'], { unique: true })
export class NotificationSettingsEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'email_notifications', type: 'boolean', default: true })
  emailNotifications!: boolean;

  @Column({ name: 'push_notifications', type: 'boolean', default: true })
  pushNotifications!: boolean;

  @Column({ name: 'in_app_notifications', type: 'boolean', default: true })
  inAppNotifications!: boolean;

  @Column({ name: 'daily_digest', type: 'boolean', default: false })
  dailyDigest!: boolean;

  @Column({ name: 'new_wo_email', type: 'boolean', default: true })
  newWoEmail!: boolean;

  @Column({ name: 'wo_assigned_email', type: 'boolean', default: true })
  woAssignedEmail!: boolean;

  @Column({ name: 'wo_escalation_email', type: 'boolean', default: true })
  woEscalationEmail!: boolean;

  @Column({ name: 'wo_reminder_email', type: 'boolean', default: true })
  woReminderEmail!: boolean;

  @Column({ name: 'wo_completed_email', type: 'boolean', default: true })
  woCompletedEmail!: boolean;

  @Column({ name: 'sla_breach_email', type: 'boolean', default: true })
  slaBreachEmail!: boolean;

  @Column({ name: 'quiet_hours_start', type: 'varchar', nullable: true })
  quietHoursStart!: string | null;

  @Column({ name: 'quiet_hours_end', type: 'varchar', nullable: true })
  quietHoursEnd!: string | null;

  @Column({ name: 'email_digest_frequency', type: 'varchar', default: 'REALTIME' })
  emailDigestFrequency!: string;
}
