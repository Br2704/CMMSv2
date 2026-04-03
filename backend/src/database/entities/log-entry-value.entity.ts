import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { LogEntryEntity } from './log-entry.entity';
import { LogTemplateFieldEntity } from './log-template-field.entity';

@Entity('log_entry_values')
export class LogEntryValueEntity extends TimestampedUuidEntity {
  @Column({ name: 'entry_id', type: 'uuid' })
  entryId!: string;

  @Column({ name: 'field_id', type: 'uuid' })
  fieldId!: string;

  @Column({ type: 'text', nullable: true })
  value!: string | null;

  @ManyToOne(() => LogEntryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry!: LogEntryEntity;

  @ManyToOne(() => LogTemplateFieldEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'field_id' })
  field!: LogTemplateFieldEntity;
}
