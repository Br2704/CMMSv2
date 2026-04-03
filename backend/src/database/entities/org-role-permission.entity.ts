import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { OrgRoleEntity } from './org-role.entity';
import { OrganizationEntity } from './organization.entity';

@Entity('org_role_permissions')
@Unique('uq_org_role_permissions_role_module', ['roleId', 'moduleKey'])
export class OrgRolePermissionEntity extends TimestampedUuidEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ name: 'module_key', type: 'varchar' })
  moduleKey!: string;

  @Column({ type: 'simple-json', default: '[]' })
  actions!: string[];

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;

  @ManyToOne(() => OrgRoleEntity, (role) => role.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: OrgRoleEntity;
}

