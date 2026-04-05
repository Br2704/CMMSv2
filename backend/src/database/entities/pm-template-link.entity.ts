import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { DepartmentEntity } from './department.entity';
import { MaintenanceTeamEntity } from './maintenance-team.entity';
import { PlantEntity } from './plant.entity';
import { PmTemplateEntity } from './pm-template.entity';
import { UserEntity } from './user.entity';

@Entity('pm_template_links')
export class PmTemplateLinkEntity extends TimestampedUuidEntity {
  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'start_date', type: DATETIME_COLUMN_TYPE })
  startDate!: Date;

  @Column({ name: 'assigned_team_id', type: 'uuid', nullable: true })
  assignedTeamId!: string | null;

  @Column({ name: 'responsible_user_id', type: 'uuid', nullable: true })
  responsibleUserId!: string | null;

  @Column({ name: 'checklist_tasks_override', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  checklistTasksOverride!: string | null;

  @Column({ name: 'next_due_date', type: DATETIME_COLUMN_TYPE })
  nextDueDate!: Date;

  @Column({ name: 'last_generated_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  lastGeneratedAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => PmTemplateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: PmTemplateEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => MaintenanceTeamEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_team_id' })
  assignedTeam!: MaintenanceTeamEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsible_user_id' })
  responsibleUser!: UserEntity | null;
}
