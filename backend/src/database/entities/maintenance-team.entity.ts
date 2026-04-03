import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('maintenance_teams')
@Unique('uq_maintenance_teams_plant_team_name', ['plantId', 'teamName'])
export class MaintenanceTeamEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'team_name', type: 'varchar' })
  teamName!: string;

  @Column({ type: 'varchar' })
  discipline!: string;

  @Column({ name: 'team_leader_id', type: 'uuid', nullable: true })
  teamLeaderId!: string | null;

  @Column({ name: 'team_member_ids', type: 'simple-json', default: '[]' })
  teamMemberIds!: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'team_leader_id' })
  teamLeader!: UserEntity | null;
}
