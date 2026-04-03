import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { DepartmentEntity } from './department.entity';
import { MachineModuleEntity } from './machine-module.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('log_templates')
export class LogTemplateEntity extends TimestampedUuidEntity {
  @Column({ name: 'template_name', type: 'varchar' })
  templateName!: string;

  @Column({ type: 'varchar', default: 'UTILITY' })
  category!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', default: 'PER_SHIFT' })
  frequency!: string;

  @Column({ name: 'reminder_minutes_before', type: 'int', default: 0 })
  reminderMinutesBefore!: number;

  @Column({ name: 'overdue_alert_minutes', type: 'int', default: 30 })
  overdueAlertMinutes!: number;

  @Column({ name: 'notify_at_shift_start', type: 'boolean', default: true })
  notifyAtShiftStart!: boolean;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId!: string | null;

  @Column({ name: 'machine_id', type: 'uuid', nullable: true })
  machineId!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

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
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
