import { Column, Entity } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('esg_emission_factors')
export class EsgEmissionFactorEntity extends TimestampedUuidEntity {
  @Column({ name: 'energy_type', type: 'varchar' })
  energyType!: string;

  @Column({ type: 'varchar' })
  unit!: string;

  @Column({ name: 'co2_factor', type: 'decimal', precision: 14, scale: 6 })
  co2Factor!: string;

  @Column({ type: 'varchar', nullable: true })
  source!: string | null;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
