import { Column, Entity, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('esg_organization_target_entries')
@Unique('uq_esg_organization_target_entries_scope', ['organizationId', 'year', 'metricCode'])
export class EsgOrganizationTargetEntryEntity extends TimestampedUuidEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ name: 'metric_code', type: 'varchar' })
  metricCode!: string;

  @Column({ name: 'metric_label', type: 'varchar' })
  metricLabel!: string;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ name: 'target_value', type: 'decimal', precision: 18, scale: 6, default: 0 })
  targetValue!: string;

  @Column({ type: 'varchar', nullable: true })
  notes!: string | null;
}
