import { Column, Entity, Index } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

export type EmailStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'BOUNCED' | 'OPENED' | 'CLICKED';

@Entity('email_logs')
@Index('idx_email_logs_user', ['userId'])
@Index('idx_email_logs_status', ['status'])
@Index('idx_email_logs_wo', ['woId'])
@Index('idx_email_logs_created', ['createdAt'])
export class EmailLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar' })
  recipient!: string;

  @Column({ type: 'varchar' })
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', default: 'QUEUED' })
  status!: EmailStatus;

  @Column({ name: 'template_name', type: 'varchar', nullable: true })
  templateName!: string | null;

  @Column({ name: 'wo_id', type: 'uuid', nullable: true })
  woId!: string | null;

  @Column({ name: 'wo_number', type: 'varchar', nullable: true })
  woNumber!: string | null;

  @Column({ name: 'event_type', type: 'varchar', nullable: true })
  eventType!: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries!: number;

  @Column({ name: 'sent_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'opened_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  openedAt!: Date | null;

  @Column({ name: 'delivery_error', type: 'text', nullable: true })
  deliveryError!: string | null;

  @Column({ name: 'message_id', type: 'varchar', nullable: true })
  messageId!: string | null;
}
