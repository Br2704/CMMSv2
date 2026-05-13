import { Column, Entity, Index } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

export type EscalationLevel = 1 | 2 | 3 | 4 | 5;
export type EscalationTrigger = 'NOT_OPENED' | 'NOT_ACKNOWLEDGED' | 'NOT_ATTENDED' | 'NOT_CLOSED' | 'SLA_BREACHED';

@Entity('escalation_history')
@Index('idx_escalation_wo', ['woId'])
@Index('idx_escalation_level', ['level'])
@Index('idx_escalation_status', ['resolved'])
export class EscalationHistoryEntity extends TimestampedUuidEntity {
  @Column({ name: 'wo_id', type: 'uuid' })
  woId!: string;

  @Column({ name: 'wo_number', type: 'varchar' })
  woNumber!: string;

  @Column({ type: 'int' })
  level!: EscalationLevel;

  @Column({ name: 'trigger_type', type: 'varchar' })
  triggerType!: EscalationTrigger;

  @Column({ name: 'triggered_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  triggeredAt!: Date;

  @Column({ name: 'notified_users', type: 'simple-json', default: '[]' })
  notifiedUsers!: string[];

  @Column({ name: 'notified_emails', type: 'simple-json', default: '[]' })
  notifiedEmails!: string[];

  @Column({ name: 'escalated_to_role', type: 'varchar', nullable: true })
  escalatedToRole!: string | null;

  @Column({ name: 'escalated_to_user_id', type: 'uuid', nullable: true })
  escalatedToUserId!: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: string;

  @Column({ name: 'resolved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'reminder_count', type: 'int', default: 0 })
  reminderCount!: number;

  @Column({ name: 'last_reminder_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  lastReminderAt!: Date | null;

  @Column({ name: 'resolved', type: 'boolean', default: false })
  resolved!: boolean;
}
