import { Column, Entity } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('esg_reports')
export class EsgReportEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'report_type', type: 'varchar' })
  reportType!: string;

  @Column({ name: 'period_start', type: DATETIME_COLUMN_TYPE })
  periodStart!: Date;

  @Column({ name: 'period_end', type: DATETIME_COLUMN_TYPE })
  periodEnd!: Date;

  @Column({ name: 'generated_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  generatedAt!: Date;

  @Column({ name: 'generated_by', type: 'uuid', nullable: true })
  generatedBy!: string | null;

  @Column({ name: 'storage_path', type: 'varchar', nullable: true })
  storagePath!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  summary!: Record<string, unknown> | null;
}
