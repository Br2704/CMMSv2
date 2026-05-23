import { Column, Entity, Index } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

export type MailQueueStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';

@Entity('mail_queue')
@Index('idx_mail_queue_status', ['status'])
@Index('idx_mail_queue_priority', ['priority', 'createdAt'])
export class MailQueueEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar' })
  recipient!: string;

  @Column({ type: 'varchar', nullable: true })
  cc!: string | null;

  @Column({ type: 'varchar', nullable: true })
  bcc!: string | null;

  @Column({ type: 'varchar' })
  subject!: string;

  @Column({ name: 'html_body', type: 'text' })
  htmlBody!: string;

  @Column({ name: 'text_body', type: 'text', nullable: true })
  textBody!: string | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status!: MailQueueStatus;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'next_retry_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  nextRetryAt!: Date | null;

  @Column({ name: 'processed_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'template_name', type: 'varchar', nullable: true })
  templateName!: string | null;

  @Column({ name: 'template_data', type: 'simple-json', nullable: true })
  templateData!: Record<string, unknown> | null;

  @Column({ name: 'wo_id', type: 'uuid', nullable: true })
  woId!: string | null;

  @Column({ name: 'wo_number', type: 'varchar', nullable: true })
  woNumber!: string | null;

  @Column({ name: 'event_type', type: 'varchar', nullable: true })
  eventType!: string | null;
}
