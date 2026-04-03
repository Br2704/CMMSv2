import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { OrganizationEntity } from './organization.entity';

@Entity('organization_features')
@Unique('uq_organization_features_org_key', ['organizationId', 'featureKey'])
export class OrganizationFeatureEntity extends TimestampedUuidEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'feature_key', type: 'varchar' })
  featureKey!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;
}

