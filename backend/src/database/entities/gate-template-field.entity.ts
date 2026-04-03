import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { GateEntryTypeEntity } from './gate-entry-type.entity';

@Entity('gate_template_fields')
export class GateTemplateFieldEntity extends TimestampedUuidEntity {
  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @Column({ name: 'field_name', type: 'varchar' })
  fieldName!: string;

  @Column({ name: 'field_label', type: 'varchar' })
  fieldLabel!: string;

  @Column({ name: 'field_type', type: 'varchar', default: 'TEXT' })
  fieldType!: string;

  @Column({ type: 'simple-json', nullable: true })
  options!: string[] | null;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired!: boolean;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ name: 'allowed_min', type: 'decimal', precision: 12, scale: 2, nullable: true })
  allowedMin!: string | null;

  @Column({ name: 'allowed_max', type: 'decimal', precision: 12, scale: 2, nullable: true })
  allowedMax!: string | null;

  @Column({ name: 'placeholder', type: 'varchar', nullable: true })
  placeholder!: string | null;

  @Column({ name: 'field_group', type: 'varchar', nullable: true })
  fieldGroup!: string | null;

  @Column({ name: 'capture_key', type: 'varchar', nullable: true })
  captureKey!: string | null;

  @Column({ name: 'help_text', type: 'varchar', nullable: true })
  helpText!: string | null;

  @Column({ name: 'default_value', type: 'varchar', nullable: true })
  defaultValue!: string | null;

  @Column({ name: 'is_environmental', type: 'boolean', default: false })
  isEnvironmental!: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @ManyToOne(() => GateEntryTypeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: GateEntryTypeEntity;
}
