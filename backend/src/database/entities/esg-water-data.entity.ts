import { Column, Entity, Unique } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('esg_water_data')
@Unique('uq_esg_water_data_plant_period', ['plantId', 'year', 'month'])
export class EsgWaterDataEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'fresh_water_intake', type: 'decimal', precision: 14, scale: 3, default: 0 })
  freshWaterIntake!: string;

  @Column({ name: 'ground_water', type: 'decimal', precision: 14, scale: 3, default: 0 })
  groundWater!: string;

  @Column({ name: 'municipal_water', type: 'decimal', precision: 14, scale: 3, default: 0 })
  municipalWater!: string;

  @Column({ name: 'recycled_water', type: 'decimal', precision: 14, scale: 3, default: 0 })
  recycledWater!: string;

  @Column({ name: 'rain_water', type: 'decimal', precision: 14, scale: 3, default: 0 })
  rainWater!: string;

  @Column({ name: 'water_discharge', type: 'decimal', precision: 14, scale: 3, default: 0 })
  waterDischarge!: string;

  @Column({ name: 'total_water_consumption', type: 'decimal', precision: 14, scale: 3, default: 0 })
  totalWaterConsumption!: string;

  @Column({ name: 'water_intensity', type: 'decimal', precision: 14, scale: 6, nullable: true })
  waterIntensity!: string | null;

  @Column({ name: 'recycled_water_percentage', type: 'decimal', precision: 8, scale: 3, default: 0 })
  recycledWaterPercentage!: string;

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
