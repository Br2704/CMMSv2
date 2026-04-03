import { Column, Entity } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('ghg_transport_logs')
export class GhgTransportLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_entry_id', type: 'uuid', nullable: true })
  gateEntryId!: string | null;

  @Column({ name: 'gate_id', type: 'uuid', nullable: true })
  gateId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'entry_type_id', type: 'uuid', nullable: true })
  entryTypeId!: string | null;

  @Column({ name: 'source_kind', type: 'varchar', nullable: true })
  sourceKind!: string | null;

  @Column({ name: 'fuel_type', type: 'varchar', nullable: true })
  fuelType!: string | null;

  @Column({ name: 'engine_type', type: 'varchar', nullable: true })
  engineType!: string | null;

  @Column({ name: 'transport_mode', type: 'varchar', nullable: true })
  transportMode!: string | null;

  @Column({ name: 'distance_km', type: 'decimal', precision: 12, scale: 3, nullable: true })
  distanceKm!: string | null;

  @Column({ name: 'idle_time_minutes', type: 'decimal', precision: 12, scale: 3, nullable: true })
  idleTimeMinutes!: string | null;

  @Column({ name: 'material_weight_kg', type: 'decimal', precision: 12, scale: 3, nullable: true })
  materialWeightKg!: string | null;

  @Column({ name: 'waste_quantity_kg', type: 'decimal', precision: 12, scale: 3, nullable: true })
  wasteQuantityKg!: string | null;

  @Column({ name: 'emission_category', type: 'varchar', nullable: true })
  emissionCategory!: string | null;

  @Column({ name: 'scope_category', type: 'varchar', default: 'SCOPE_3' })
  scopeCategory!: string;

  @Column({ name: 'computed_co2e_kg', type: 'decimal', precision: 14, scale: 6, default: 0 })
  computedCo2eKg!: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null;
}
