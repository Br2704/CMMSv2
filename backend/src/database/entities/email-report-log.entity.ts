import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { EmailReportScheduleEntity } from './email-report-schedule.entity';

@Entity('email_report_logs')
export class EmailReportLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'schedule_id', type: 'uuid' })
  scheduleId!: string;

  @Column({ name: 'sent_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  sentAt!: Date;

  @Column({ type: 'varchar', default: 'SUCCESS' })
  status!: string;

  @Column({ type: 'simple-json', default: '[]' })
  recipients!: string[];

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'records_included', type: 'int', default: 0 })
  recordsIncluded!: number;

  @Column({ name: 'report_data', type: 'simple-json', nullable: true })
  reportData!: unknown;

  @ManyToOne(() => EmailReportScheduleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_id' })
  schedule!: EmailReportScheduleEntity;
}
