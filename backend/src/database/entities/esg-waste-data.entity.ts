import { Column, Entity, Unique } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('esg_waste_data')
@Unique('uq_esg_waste_data_plant_period', ['plantId', 'year', 'month'])
export class EsgWasteDataEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'hazardous_waste', type: 'decimal', precision: 14, scale: 3, default: 0 })
  hazardousWaste!: string;

  @Column({ name: 'non_hazardous_waste', type: 'decimal', precision: 14, scale: 3, default: 0 })
  nonHazardousWaste!: string;

  @Column({ name: 'recycled_waste', type: 'decimal', precision: 14, scale: 3, default: 0 })
  recycledWaste!: string;

  @Column({ name: 'landfill_waste', type: 'decimal', precision: 14, scale: 3, default: 0 })
  landfillWaste!: string;

  @Column({ name: 'incinerated_waste', type: 'decimal', precision: 14, scale: 3, default: 0 })
  incineratedWaste!: string;

  @Column({ name: 'total_waste', type: 'decimal', precision: 14, scale: 3, default: 0 })
  totalWaste!: string;

  @Column({ name: 'recycling_rate', type: 'decimal', precision: 8, scale: 3, default: 0 })
  recyclingRate!: string;

  @Column({ name: 'waste_intensity', type: 'decimal', precision: 14, scale: 6, nullable: true })
  wasteIntensity!: string | null;

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
