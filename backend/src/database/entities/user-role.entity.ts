import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { RoleEntity } from './role.entity';
import { UserEntity } from './user.entity';

@Entity('user_roles')
@Unique('uq_user_role_per_plant', ['userId', 'role', 'plantId'])
export class UserRoleEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId!: string | null;

  @Column({ type: 'varchar' })
  role!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => RoleEntity, (role) => role.userRoles, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'role', referencedColumnName: 'name' })
  roleRef!: RoleEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
