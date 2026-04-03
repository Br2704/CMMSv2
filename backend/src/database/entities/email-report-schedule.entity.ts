import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('email_report_schedules')
export class EmailReportScheduleEntity extends TimestampedUuidEntity {
  @Column({ name: 'report_name', type: 'varchar' })
  reportName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', default: 'DAILY' })
  frequency!: string;

  @Column({ name: 'send_time', type: 'varchar', default: '08:00' })
  sendTime!: string;

  @Column({ type: 'simple-json', default: '[]' })
  recipients!: string[];

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ name: 'last_sent_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  lastSentAt!: Date | null;

  @Column({ name: 'report_sections', type: 'simple-json', nullable: true })
  reportSections!: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  filters!: unknown;

  @Column({ name: 'include_charts', type: 'boolean', default: true })
  includeCharts!: boolean;

  @Column({ name: 'include_tables', type: 'boolean', default: true })
  includeTables!: boolean;

  @Column({ name: 'include_detailed_logs', type: 'boolean', default: false })
  includeDetailedLogs!: boolean;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
