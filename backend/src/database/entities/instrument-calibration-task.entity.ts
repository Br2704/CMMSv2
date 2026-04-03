import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AssetEntity } from './asset.entity';
import { CalibrationTemplateEntity } from './calibration-template.entity';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { InstrumentCalibrationScheduleEntity } from './instrument-calibration-schedule.entity';
import { MachineInstrumentEntity } from './machine-instrument.entity';
import { MaintenanceTeamEntity } from './maintenance-team.entity';
import { PlantEntity } from './plant.entity';

@Entity('instrument_calibration_tasks')
export class InstrumentCalibrationTaskEntity extends TimestampedUuidEntity {
  @Column({ name: 'schedule_id', type: 'uuid' })
  scheduleId!: string;

  @Column({ name: 'instrument_id', type: 'uuid' })
  instrumentId!: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId!: string | null;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'assigned_team_id', type: 'uuid', nullable: true })
  assignedTeamId!: string | null;

  @Column({ name: 'calibration_type', type: 'varchar', default: 'INTERNAL' })
  calibrationType!: string;

  @Column({ name: 'due_date', type: DATETIME_COLUMN_TYPE })
  dueDate!: Date;

  @Column({ name: 'started_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'varchar', default: 'SCHEDULED' })
  status!: string;

  @Column({ type: 'simple-json', nullable: true })
  checklist!: unknown;

  @Column({ name: 'certificate_upload', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  certificateUpload!: string | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @ManyToOne(() => InstrumentCalibrationScheduleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_id' })
  schedule!: InstrumentCalibrationScheduleEntity;

  @ManyToOne(() => MachineInstrumentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instrument_id' })
  instrument!: MachineInstrumentEntity;

  @ManyToOne(() => CalibrationTemplateEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template!: CalibrationTemplateEntity | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => MaintenanceTeamEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_team_id' })
  assignedTeam!: MaintenanceTeamEntity | null;
}
