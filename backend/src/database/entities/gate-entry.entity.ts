import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { DepartmentEntity } from './department.entity';
import { GateEntryTypeEntity } from './gate-entry-type.entity';
import { GateEntity } from './gate.entity';
import { MachineModuleEntity } from './machine-module.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('gate_entries')
export class GateEntryEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_id', type: 'uuid' })
  gateId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId!: string | null;

  @Column({ name: 'machine_id', type: 'uuid', nullable: true })
  machineId!: string | null;

  @Column({ name: 'visitor_name', type: 'varchar' })
  visitorName!: string;

  @Column({ name: 'visitor_company', type: 'varchar', nullable: true })
  visitorCompany!: string | null;

  @Column({ name: 'visitor_phone', type: 'varchar', nullable: true })
  visitorPhone!: string | null;

  @Column({ name: 'visitor_type', type: 'varchar', default: 'VISITOR' })
  visitorType!: string;

  @Column({ type: 'varchar', nullable: true })
  purpose!: string | null;

  @Column({ name: 'person_to_meet', type: 'varchar', nullable: true })
  personToMeet!: string | null;

  @Column({ name: 'vehicle_number', type: 'varchar', nullable: true })
  vehicleNumber!: string | null;

  @Column({ name: 'id_proof_type', type: 'varchar', nullable: true })
  idProofType!: string | null;

  @Column({ name: 'id_proof_number', type: 'varchar', nullable: true })
  idProofNumber!: string | null;

  @Column({ name: 'items_carried', type: 'text', nullable: true })
  itemsCarried!: string | null;

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

  @Column({ name: 'entry_data', type: 'simple-json', nullable: true })
  entryData!: Array<Record<string, unknown>> | null;

  @Column({ name: 'qr_code_value', type: 'varchar', nullable: true, unique: true })
  qrCodeValue!: string | null;

  @Column({ name: 'duplicate_detected', type: 'boolean', default: false })
  duplicateDetected!: boolean;

  @Column({ name: 'blacklist_alert', type: 'boolean', default: false })
  blacklistAlert!: boolean;

  @Column({ name: 'watchlist_alert', type: 'boolean', default: false })
  watchlistAlert!: boolean;

  @Column({ name: 'entry_time', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  entryTime!: Date;

  @Column({ name: 'exit_time', type: DATETIME_COLUMN_TYPE, nullable: true })
  exitTime!: Date | null;

  @Column({ name: 'badge_number', type: 'varchar', nullable: true })
  badgeNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy!: string | null;

  @Column({ name: 'exit_approved_by', type: 'uuid', nullable: true })
  exitApprovedBy!: string | null;

  @Column({ name: 'exit_remarks', type: 'text', nullable: true })
  exitRemarks!: string | null;

  @Column({ type: 'varchar', default: 'IN' })
  status!: string;

  @ManyToOne(() => GateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_id' })
  gate!: GateEntity;

  @ManyToOne(() => GateEntryTypeEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template!: GateEntryTypeEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => MachineModuleEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'module_id' })
  module!: MachineModuleEntity | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'machine_id' })
  machine!: AssetEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recorded_by' })
  recordedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'exit_approved_by' })
  exitApprovedByUser!: UserEntity | null;
}
