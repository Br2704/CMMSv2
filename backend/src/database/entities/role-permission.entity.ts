import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { RoleEntity } from './role.entity';

@Entity('role_permissions')
@Unique('uq_role_permissions_role_module_key', ['roleId', 'moduleKey'])
export class RolePermissionEntity extends TimestampedUuidEntity {
  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  role!: string | null;

  @Column({ name: 'module_key', type: 'varchar', nullable: true })
  moduleKey!: string | null;

  @Column({ name: 'module_id', type: 'varchar' })
  moduleId!: string;

  @Column({ type: 'simple-json', default: '[]' })
  actions!: string[];

  @ManyToOne(() => RoleEntity, (role) => role.permissions, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'role_id' })
  roleRef!: RoleEntity | null;
}
