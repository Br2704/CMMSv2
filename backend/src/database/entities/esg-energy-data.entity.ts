import { Column, Entity, Unique } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('esg_energy_data')
@Unique('uq_esg_energy_data_plant_period', ['plantId', 'year', 'month'])
export class EsgEnergyDataEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'grid_electricity_kwh', type: 'decimal', precision: 14, scale: 3, default: 0 })
  gridElectricityKwh!: string;

  @Column({ name: 'diesel_consumption_litre', type: 'decimal', precision: 14, scale: 3, default: 0 })
  dieselConsumptionLitre!: string;

  @Column({ name: 'coal_consumption', type: 'decimal', precision: 14, scale: 3, default: 0 })
  coalConsumption!: string;

  @Column({ name: 'gas_consumption', type: 'decimal', precision: 14, scale: 3, default: 0 })
  gasConsumption!: string;

  @Column({ name: 'steam_consumption', type: 'decimal', precision: 14, scale: 3, default: 0 })
  steamConsumption!: string;

  @Column({ name: 'solar_generation', type: 'decimal', precision: 14, scale: 3, default: 0 })
  solarGeneration!: string;

  @Column({ name: 'wind_generation', type: 'decimal', precision: 14, scale: 3, default: 0 })
  windGeneration!: string;

  @Column({ name: 'green_energy_purchase', type: 'decimal', precision: 14, scale: 3, default: 0 })
  greenEnergyPurchase!: string;

  @Column({ name: 'total_energy', type: 'decimal', precision: 14, scale: 3, default: 0 })
  totalEnergy!: string;

  @Column({ name: 'renewable_energy_percentage', type: 'decimal', precision: 8, scale: 3, default: 0 })
  renewableEnergyPercentage!: string;

  @Column({ name: 'energy_intensity', type: 'decimal', precision: 14, scale: 6, nullable: true })
  energyIntensity!: string | null;

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
