import { Column, Entity, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { OrganizationEntity } from './organization.entity';
import { OrgRolePermissionEntity } from './org-role-permission.entity';
import { UserEntity } from './user.entity';

@Entity('org_roles')
@Unique('uq_org_roles_org_key', ['organizationId', 'key'])
export class OrgRoleEntity extends TimestampedUuidEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar' })
  key!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;

  @OneToMany(() => OrgRolePermissionEntity, (permission) => permission.role)
  permissions!: OrgRolePermissionEntity[];

  @OneToMany(() => UserEntity, (user) => user.orgRole)
  users!: UserEntity[];
}

