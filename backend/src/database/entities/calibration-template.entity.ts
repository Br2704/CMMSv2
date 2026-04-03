import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { MaintenanceTeamEntity } from './maintenance-team.entity';
import { PlantEntity } from './plant.entity';

@Entity('calibration_templates')
@Unique('uq_calibration_templates_plant_name', ['plantId', 'templateName'])
export class CalibrationTemplateEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'template_name', type: 'varchar' })
  templateName!: string;

  @Column({ name: 'instrument_type', type: 'varchar' })
  instrumentType!: string;

  @Column({ name: 'calibration_method', type: 'varchar' })
  calibrationMethod!: string;

  @Column({ type: 'varchar', nullable: true })
  tolerance!: string | null;

  @Column({ name: 'frequency_type', type: 'varchar' })
  frequencyType!: string;

  @Column({ name: 'frequency_value', type: 'int', default: 1 })
  frequencyValue!: number;

  @Column({ name: 'estimated_duration', type: 'int', default: 60 })
  estimatedDuration!: number;

  @Column({ name: 'responsible_team_id', type: 'uuid', nullable: true })
  responsibleTeamId!: string | null;

  @Column({ name: 'checklist_tasks', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  checklistTasks!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => MaintenanceTeamEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsible_team_id' })
  responsibleTeam!: MaintenanceTeamEntity | null;
}
