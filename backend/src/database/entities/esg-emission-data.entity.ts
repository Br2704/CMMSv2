import { Column, Entity, Unique } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('esg_emission_data')
@Unique('uq_esg_emission_data_plant_period', ['plantId', 'year', 'month'])
export class EsgEmissionDataEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'scope1_emissions', type: 'decimal', precision: 14, scale: 6, default: 0 })
  scope1Emissions!: string;

  @Column({ name: 'scope2_emissions', type: 'decimal', precision: 14, scale: 6, default: 0 })
  scope2Emissions!: string;

  @Column({ name: 'scope3_emissions', type: 'decimal', precision: 14, scale: 6, default: 0 })
  scope3Emissions!: string;

  @Column({ name: 'boiler_nox', type: 'decimal', precision: 14, scale: 6, default: 0 })
  boilerNox!: string;

  @Column({ name: 'boiler_sox', type: 'decimal', precision: 14, scale: 6, default: 0 })
  boilerSox!: string;

  @Column({ name: 'boiler_pm', type: 'decimal', precision: 14, scale: 6, default: 0 })
  boilerPm!: string;

  @Column({ name: 'stack_emission', type: 'decimal', precision: 14, scale: 6, default: 0 })
  stackEmission!: string;

  @Column({ name: 'total_ghg_emissions', type: 'decimal', precision: 14, scale: 6, default: 0 })
  totalGhgEmissions!: string;

  @Column({ name: 'emission_intensity', type: 'decimal', precision: 14, scale: 6, nullable: true })
  emissionIntensity!: string | null;

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
