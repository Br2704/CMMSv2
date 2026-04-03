import { Column, Entity, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('esg_targets')
@Unique('uq_esg_targets_plant_year', ['plantId', 'year'])
export class EsgTargetEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ name: 'target_energy_reduction', type: 'decimal', precision: 12, scale: 3, nullable: true })
  targetEnergyReduction!: string | null;

  @Column({ name: 'target_water_reduction', type: 'decimal', precision: 12, scale: 3, nullable: true })
  targetWaterReduction!: string | null;

  @Column({ name: 'target_emission_reduction', type: 'decimal', precision: 12, scale: 3, nullable: true })
  targetEmissionReduction!: string | null;

  @Column({ name: 'target_waste_reduction', type: 'decimal', precision: 12, scale: 3, nullable: true })
  targetWasteReduction!: string | null;

  @Column({ name: 'renewable_target', type: 'decimal', precision: 12, scale: 3, nullable: true })
  renewableTarget!: string | null;
}
