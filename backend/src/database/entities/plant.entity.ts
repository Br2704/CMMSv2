import { Column, Entity, JoinColumn, ManyToOne, OneToMany, VersionColumn } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { DepartmentEntity } from './department.entity';
import { OrganizationEntity } from './organization.entity';
import { ProfileEntity } from './profile.entity';
import { ShiftEntity } from './shift.entity';

@Entity('plants')
export class PlantEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_code', type: 'varchar', unique: true })
  plantCode!: string;

  @Column({ name: 'plant_name', type: 'varchar' })
  plantName!: string;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  @Column({ name: 'plant_admin_id', type: 'uuid', nullable: true })
  plantAdminId!: string | null;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @ManyToOne(() => ProfileEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_admin_id', referencedColumnName: 'userId' })
  plantAdmin!: ProfileEntity | null;

  @ManyToOne(() => OrganizationEntity, (organization) => organization.plants, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;

  @OneToMany(() => DepartmentEntity, (department) => department.plant)
  departments!: DepartmentEntity[];

  @OneToMany(() => ShiftEntity, (shift) => shift.plant)
  shifts!: ShiftEntity[];
}
