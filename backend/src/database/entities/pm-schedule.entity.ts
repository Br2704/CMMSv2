import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { MaintenanceTeamEntity } from './maintenance-team.entity';
import { PlantEntity } from './plant.entity';
import { PmTemplateEntity } from './pm-template.entity';
import { PmTemplateLinkEntity } from './pm-template-link.entity';
import { UserEntity } from './user.entity';

@Entity('pm_schedules')
export class PmScheduleEntity extends TimestampedUuidEntity {
  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId!: string | null;

  @Column({ name: 'template_link_id', type: 'uuid', nullable: true })
  templateLinkId!: string | null;

  @Column({ name: 'maintenance_type', type: 'varchar', default: 'PM' })
  maintenanceType!: string;

  @Column({ type: 'varchar', nullable: true })
  discipline!: string | null;

  @Column({ type: 'varchar' })
  frequency!: string;

  @Column({ name: 'frequency_type', type: 'varchar', nullable: true })
  frequencyType!: string | null;

  @Column({ name: 'frequency_value', type: 'int', nullable: true })
  frequencyValue!: number | null;

  @Column({ name: 'estimated_duration', type: 'int', nullable: true })
  estimatedDuration!: number | null;

  @Column({ type: 'simple-json', nullable: true })
  checklist!: unknown;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ name: 'assigned_team_id', type: 'uuid', nullable: true })
  assignedTeamId!: string | null;

  @Column({ name: 'last_completed', type: DATETIME_COLUMN_TYPE, nullable: true })
  lastCompleted!: Date | null;

  @Column({ name: 'next_due', type: DATETIME_COLUMN_TYPE })
  nextDue!: Date;

  @Column({ name: 'completed_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'varchar', default: 'SCHEDULED' })
  status!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => PmTemplateEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template!: PmTemplateEntity | null;

  @ManyToOne(() => PmTemplateLinkEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_link_id' })
  templateLink!: PmTemplateLinkEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to' })
  assignedToUser!: UserEntity | null;

  @ManyToOne(() => MaintenanceTeamEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_team_id' })
  assignedTeam!: MaintenanceTeamEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
