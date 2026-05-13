import { Column, Entity, Index } from 'typeorm';
import { TimestampedUuidEntity } from './common';

export type SlaScope = 'DEPARTMENT' | 'CATEGORY' | 'PRIORITY' | 'ASSET_CRITICALITY' | 'PLANT' | 'GLOBAL';

@Entity('sla_config')
@Index('idx_sla_config_scope', ['scope', 'scopeValue'])
@Index('idx_sla_config_priority', ['priority'])
export class SlaConfigEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar', default: 'GLOBAL' })
  scope!: SlaScope;

  @Column({ name: 'scope_value', type: 'varchar', nullable: true })
  scopeValue!: string | null;

  @Column({ type: 'varchar', default: 'MEDIUM' })
  priority!: string;

  @Column({ name: 'response_time_minutes', type: 'int', default: 30 })
  responseTimeMinutes!: number;

  @Column({ name: 'acknowledgement_time_minutes', type: 'int', default: 15 })
  acknowledgementTimeMinutes!: number;

  @Column({ name: 'closure_time_minutes', type: 'int', default: 480 })
  closureTimeMinutes!: number;

  @Column({ name: 'escalation_1_minutes', type: 'int', default: 30 })
  escalation1Minutes!: number;

  @Column({ name: 'escalation_2_minutes', type: 'int', default: 60 })
  escalation2Minutes!: number;

  @Column({ name: 'escalation_3_minutes', type: 'int', default: 120 })
  escalation3Minutes!: number;

  @Column({ name: 'escalation_4_minutes', type: 'int', default: 240 })
  escalation4Minutes!: number;

  @Column({ name: 'reminder_interval_minutes', type: 'int', default: 60 })
  reminderIntervalMinutes!: number;

  @Column({ name: 'escalation_role_1', type: 'varchar', nullable: true })
  escalationRole1!: string | null;

  @Column({ name: 'escalation_role_2', type: 'varchar', nullable: true })
  escalationRole2!: string | null;

  @Column({ name: 'escalation_role_3', type: 'varchar', nullable: true })
  escalationRole3!: string | null;

  @Column({ name: 'escalation_role_4', type: 'varchar', nullable: true })
  escalationRole4!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;
}
