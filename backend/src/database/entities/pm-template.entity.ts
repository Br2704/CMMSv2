import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';

@Entity('pm_templates')
export class PmTemplateEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'template_name', type: 'varchar' })
  templateName!: string;

  @Column({ name: 'maintenance_type', type: 'varchar', default: 'PM' })
  maintenanceType!: string;

  @Column({ type: 'varchar', nullable: true })
  discipline!: string | null;

  @Column({ name: 'frequency_type', type: 'varchar' })
  frequencyType!: string;

  @Column({ name: 'frequency_value', type: 'int', default: 1 })
  frequencyValue!: number;

  @Column({ name: 'estimated_duration', type: 'int', default: 60 })
  estimatedDuration!: number;

  @Column({ name: 'checklist_tasks', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  checklistTasks!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'version_number', type: 'int', default: 1 })
  versionNumber!: number;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
