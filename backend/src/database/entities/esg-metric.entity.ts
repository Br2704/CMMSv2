import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { LogTemplateFieldEntity } from './log-template-field.entity';
import { LogTemplateEntity } from './log-template.entity';
import { PlantEntity } from './plant.entity';

@Entity('esg_metrics')
export class EsgMetricEntity extends TimestampedUuidEntity {
  @Column({ name: 'metric_name', type: 'varchar' })
  metricName!: string;

  @Column({ type: 'varchar', default: 'Energy' })
  category!: string;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ name: 'target_value', type: 'decimal', precision: 12, scale: 2, nullable: true })
  targetValue!: string | null;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId!: string | null;

  @Column({ name: 'field_id', type: 'uuid', nullable: true })
  fieldId!: string | null;

  @Column({ name: 'aggregation_method', type: 'varchar', default: 'SUM' })
  aggregationMethod!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => LogTemplateEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template!: LogTemplateEntity | null;

  @ManyToOne(() => LogTemplateFieldEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'field_id' })
  field!: LogTemplateFieldEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
