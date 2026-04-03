import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { GateEntryEntity } from './gate-entry.entity';
import { GateEntryTypeEntity } from './gate-entry-type.entity';
import { GateEntity } from './gate.entity';
import { PlantEntity } from './plant.entity';

@Entity('gate_vehicle_entries')
export class GateVehicleEntryEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_entry_id', type: 'uuid', nullable: true })
  gateEntryId!: string | null;

  @Column({ name: 'gate_id', type: 'uuid' })
  gateId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId!: string | null;

  @Column({ name: 'movement_type', type: 'varchar', default: 'VEHICLE_ENTRY' })
  movementType!: string;

  @Column({ name: 'vehicle_number', type: 'varchar', nullable: true })
  vehicleNumber!: string | null;

  @Column({ name: 'driver_name', type: 'varchar', nullable: true })
  driverName!: string | null;

  @Column({ name: 'driver_contact', type: 'varchar', nullable: true })
  driverContact!: string | null;

  @Column({ name: 'vehicle_type', type: 'varchar', nullable: true })
  vehicleType!: string | null;

  @Column({ name: 'fuel_type', type: 'varchar', nullable: true })
  fuelType!: string | null;

  @Column({ name: 'engine_type', type: 'varchar', nullable: true })
  engineType!: string | null;

  @Column({ name: 'vendor_name', type: 'varchar', nullable: true })
  vendorName!: string | null;

  @Column({ name: 'material_description', type: 'text', nullable: true })
  materialDescription!: string | null;

  @Column({ name: 'quantity', type: 'decimal', precision: 12, scale: 2, nullable: true })
  quantity!: string | null;

  @Column({ name: 'gate_pass_number', type: 'varchar', nullable: true })
  gatePassNumber!: string | null;

  @Column({ name: 'invoice_number', type: 'varchar', nullable: true })
  invoiceNumber!: string | null;

  @Column({ name: 'transport_distance_km', type: 'decimal', precision: 12, scale: 3, nullable: true })
  transportDistanceKm!: string | null;

  @Column({ name: 'transport_mode', type: 'varchar', nullable: true })
  transportMode!: string | null;

  @Column({ name: 'load_weight', type: 'decimal', precision: 12, scale: 3, nullable: true })
  loadWeight!: string | null;

  @Column({ name: 'unload_weight', type: 'decimal', precision: 12, scale: 3, nullable: true })
  unloadWeight!: string | null;

  @Column({ name: 'idle_time_minutes', type: 'decimal', precision: 12, scale: 3, nullable: true })
  idleTimeMinutes!: string | null;

  @Column({ name: 'waste_type', type: 'varchar', nullable: true })
  wasteType!: string | null;

  @Column({ name: 'waste_quantity', type: 'decimal', precision: 12, scale: 3, nullable: true })
  wasteQuantity!: string | null;

  @Column({ name: 'emission_category', type: 'varchar', nullable: true })
  emissionCategory!: string | null;

  @Column({ name: 'estimated_co2e_kg', type: 'decimal', precision: 14, scale: 6, nullable: true })
  estimatedCo2eKg!: string | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'entry_time', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  entryTime!: Date;

  @ManyToOne(() => GateEntryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_entry_id' })
  gateEntry!: GateEntryEntity | null;

  @ManyToOne(() => GateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_id' })
  gate!: GateEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => GateEntryTypeEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template!: GateEntryTypeEntity | null;
}
