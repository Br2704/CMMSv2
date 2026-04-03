import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { GateEntryEntity } from './gate-entry.entity';
import { GateEntryTypeEntity } from './gate-entry-type.entity';
import { GateEntity } from './gate.entity';
import { PlantEntity } from './plant.entity';

@Entity('gate_material_entries')
export class GateMaterialEntryEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_entry_id', type: 'uuid', nullable: true })
  gateEntryId!: string | null;

  @Column({ name: 'gate_id', type: 'uuid' })
  gateId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'entry_type_id', type: 'uuid', nullable: true })
  entryTypeId!: string | null;

  @Column({ name: 'material_name', type: 'varchar', nullable: true })
  materialName!: string | null;

  @Column({ name: 'material_category', type: 'varchar', nullable: true })
  materialCategory!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
  quantity!: string | null;

  @Column({ name: 'unit_of_measurement', type: 'varchar', nullable: true })
  unitOfMeasurement!: string | null;

  @Column({ type: 'varchar', nullable: true })
  vendor!: string | null;

  @Column({ name: 'purchase_order_number', type: 'varchar', nullable: true })
  purchaseOrderNumber!: string | null;

  @Column({ name: 'gate_pass_number', type: 'varchar', nullable: true })
  gatePassNumber!: string | null;

  @Column({ name: 'invoice_number', type: 'varchar', nullable: true })
  invoiceNumber!: string | null;

  @Column({ name: 'hazard_category', type: 'varchar', nullable: true })
  hazardCategory!: string | null;

  @Column({ name: 'transport_mode', type: 'varchar', nullable: true })
  transportMode!: string | null;

  @Column({ name: 'transport_distance_km', type: 'decimal', precision: 12, scale: 3, nullable: true })
  transportDistanceKm!: string | null;

  @Column({ name: 'emission_category', type: 'varchar', nullable: true })
  emissionCategory!: string | null;

  @Column({ name: 'estimated_co2e_kg', type: 'decimal', precision: 14, scale: 6, nullable: true })
  estimatedCo2eKg!: string | null;

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
  @JoinColumn({ name: 'entry_type_id' })
  entryType!: GateEntryTypeEntity | null;
}
