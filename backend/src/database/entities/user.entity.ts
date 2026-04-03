import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { OrgRoleEntity } from './org-role.entity';
import { OrganizationEntity } from './organization.entity';
import { ProfileEntity } from './profile.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { UserRoleEntity } from './user-role.entity';

@Entity('users')
export class UserEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar' })
  fullName!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'org_role_id', type: 'uuid', nullable: true })
  orgRoleId!: string | null;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled!: boolean;

  @Column({ name: 'mfa_secret_encrypted', type: 'text', nullable: true })
  mfaSecretEncrypted!: string | null;

  @Column({ name: 'failed_login_count', type: 'int', default: 0 })
  failedLoginCount!: number;

  @Column({ name: 'locked_until', type: DATETIME_COLUMN_TYPE, nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'last_login_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', nullable: true })
  lastLoginIp!: string | null;

  @OneToOne(() => ProfileEntity, (profile) => profile.user)
  profile!: ProfileEntity;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.user)
  userRoles!: UserRoleEntity[];

  @OneToMany(() => RefreshTokenEntity, (refreshToken) => refreshToken.user)
  refreshTokens!: RefreshTokenEntity[];

  @ManyToOne(() => OrganizationEntity, (organization) => organization.users, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity | null;

  @ManyToOne(() => OrgRoleEntity, (role) => role.users, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'org_role_id' })
  orgRole!: OrgRoleEntity | null;
}
