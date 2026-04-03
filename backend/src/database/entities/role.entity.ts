import { Column, Entity, OneToMany } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { RoleDashboardKpiEntity } from './role-dashboard-kpi.entity';
import { RolePermissionEntity } from './role-permission.entity';
import { UserRoleEntity } from './user-role.entity';

@Entity('roles')
export class RoleEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar', unique: true })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.roleRef)
  userRoles!: UserRoleEntity[];

  @OneToMany(() => RolePermissionEntity, (permission) => permission.roleRef)
  permissions!: RolePermissionEntity[];

  @OneToMany(() => RoleDashboardKpiEntity, (kpi) => kpi.role)
  dashboardKpis!: RoleDashboardKpiEntity[];
}
