import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { DATETIME_COLUMN_TYPE } from './common';
import { OrganizationEntity } from './organization.entity';

@Entity('org_rbac_meta')
export class OrgRbacMetaEntity {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: DATETIME_COLUMN_TYPE })
  updatedAt!: Date;

  @OneToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;
}

