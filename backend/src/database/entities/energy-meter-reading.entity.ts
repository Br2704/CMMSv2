import { Column, Entity } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';

@Entity('energy_meter_readings')
export class EnergyMeterReadingEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'meter_id', type: 'varchar' })
  meterId!: string;

  @Column({ name: 'captured_at', type: DATETIME_COLUMN_TYPE })
  capturedAt!: Date;

  @Column({ name: 'kwh', type: 'decimal', precision: 14, scale: 3 })
  kwh!: string;

  @Column({ name: 'demand_kw', type: 'decimal', precision: 14, scale: 3, nullable: true })
  demandKw!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
