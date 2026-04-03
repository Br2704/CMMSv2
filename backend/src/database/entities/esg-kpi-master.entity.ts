import { Column, Entity } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('esg_kpi_master')
export class EsgKpiMasterEntity extends TimestampedUuidEntity {
  @Column({ name: 'kpi_name', type: 'varchar' })
  kpiName!: string;

  @Column({ name: 'kpi_category', type: 'varchar' })
  kpiCategory!: string;

  @Column({ type: 'text', nullable: true })
  formula!: string | null;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: string;
}
