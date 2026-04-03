import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { LogTemplateEntity } from './log-template.entity';

@Entity('log_template_fields')
export class LogTemplateFieldEntity extends TimestampedUuidEntity {
  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @Column({ name: 'section_name', type: 'varchar', default: 'General' })
  sectionName!: string;

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

  @Column({ name: 'min_value', type: 'decimal', precision: 12, scale: 2, nullable: true })
  minValue!: string | null;

  @Column({ name: 'max_value', type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxValue!: string | null;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ name: 'validation_rules', type: 'simple-json', nullable: true })
  validationRules!: unknown;

  @Column({ name: 'conditional_on', type: 'simple-json', nullable: true })
  conditionalOn!: unknown;

  @ManyToOne(() => LogTemplateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: LogTemplateEntity;
}
