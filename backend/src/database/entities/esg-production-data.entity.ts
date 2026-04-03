import { Column, Entity, Unique } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('esg_production_data')
@Unique('uq_esg_production_data_plant_period', ['plantId', 'year', 'month'])
export class EsgProductionDataEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'production_quantity', type: 'decimal', precision: 14, scale: 3, default: 0 })
  productionQuantity!: string;

  @Column({ name: 'operating_hours', type: 'decimal', precision: 14, scale: 3, default: 0 })
  operatingHours!: string;

  @Column({ name: 'machine_utilization', type: 'decimal', precision: 8, scale: 3, default: 0 })
  machineUtilization!: string;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked!: boolean;

  @Column({ name: 'verified_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
