import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { DepartmentEntity } from './department.entity';
import { MaintenanceTeamEntity } from './maintenance-team.entity';
import { PlantEntity } from './plant.entity';

@Entity('work_order_team_mappings')
@Unique('uq_work_order_team_mapping_plant_department_category', ['plantId', 'departmentId', 'category'])
export class WorkOrderTeamMappingEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ name: 'team_id', type: 'uuid' })
  teamId!: string;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => MaintenanceTeamEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team!: MaintenanceTeamEntity;
}
