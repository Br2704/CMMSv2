import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { CalibrationTemplateEntity } from './calibration-template.entity';
import { MachineInstrumentEntity } from './machine-instrument.entity';
import { MaintenanceTeamEntity } from './maintenance-team.entity';
import { PlantEntity } from './plant.entity';

@Entity('instrument_calibration_schedules')
export class InstrumentCalibrationScheduleEntity extends TimestampedUuidEntity {
  @Column({ name: 'instrument_id', type: 'uuid' })
  instrumentId!: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'start_date', type: DATETIME_COLUMN_TYPE })
  startDate!: Date;

  @Column({ name: 'next_due_date', type: DATETIME_COLUMN_TYPE })
  nextDueDate!: Date;

  @Column({ name: 'assigned_team_id', type: 'uuid', nullable: true })
  assignedTeamId!: string | null;

  @Column({ name: 'calibration_type', type: 'varchar', default: 'INTERNAL' })
  calibrationType!: string;

  @Column({ name: 'last_generated_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  lastGeneratedAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => MachineInstrumentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instrument_id' })
  instrument!: MachineInstrumentEntity;

  @ManyToOne(() => CalibrationTemplateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: CalibrationTemplateEntity;

  @ManyToOne(() => MaintenanceTeamEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_team_id' })
  assignedTeam!: MaintenanceTeamEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
