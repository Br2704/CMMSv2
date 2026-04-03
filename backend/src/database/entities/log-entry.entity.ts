import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { DepartmentEntity } from './department.entity';
import { LogTemplateEntity } from './log-template.entity';
import { MachineModuleEntity } from './machine-module.entity';
import { PlantEntity } from './plant.entity';
import { ShiftEntity } from './shift.entity';
import { UserEntity } from './user.entity';

@Entity('log_entries')
export class LogEntryEntity extends TimestampedUuidEntity {
  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @Column({ name: 'shift_id', type: 'uuid', nullable: true })
  shiftId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId!: string | null;

  @Column({ name: 'machine_id', type: 'uuid', nullable: true })
  machineId!: string | null;

  @Column({ name: 'logged_by', type: 'uuid', nullable: true })
  loggedBy!: string | null;

  @Column({ name: 'log_date', type: 'date', default: () => 'CURRENT_DATE' })
  logDate!: string;

  @Column({ type: 'varchar', default: 'DRAFT' })
  status!: string;

  @Column({ name: 'submitted_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @ManyToOne(() => LogTemplateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: LogTemplateEntity;

  @ManyToOne(() => ShiftEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shift_id' })
  shift!: ShiftEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => MachineModuleEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'module_id' })
  module!: MachineModuleEntity | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'machine_id' })
  machine!: AssetEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'logged_by' })
  loggedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedByUser!: UserEntity | null;
}
