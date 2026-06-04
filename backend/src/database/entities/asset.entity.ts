import { Column, Entity, JoinColumn, ManyToOne, VersionColumn } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { CostCenterEntity } from './cost-center.entity';
import { DepartmentEntity } from './department.entity';
import { MachineModuleEntity } from './machine-module.entity';
import { PlantEntity } from './plant.entity';
import { VendorEntity } from './vendor.entity';

@Entity('assets')
export class AssetEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar' })
  code!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', default: 'MACHINE' })
  type!: string;

  @Column({ name: 'asset_type', type: 'varchar', default: 'PUMP' })
  assetType!: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'default_category', type: 'varchar', nullable: true })
  defaultCategory!: string | null;

  @Column({ type: 'varchar', default: 'B Medium' })
  criticality!: string;

  @Column({ name: 'commission_date', type: 'date', nullable: true })
  commissionDate!: string | null;

  @Column({ name: 'warranty_expiry', type: 'date', nullable: true })
  warrantyExpiry!: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'varchar', nullable: true })
  make!: string | null;

  @Column({ type: 'varchar', nullable: true })
  manufacturer!: string | null;

  @Column({ type: 'varchar', nullable: true })
  model!: string | null;

  @Column({ name: 'rated_capacity', type: 'decimal', precision: 12, scale: 3, nullable: true })
  ratedCapacity!: string | null;

  @Column({ name: 'capacity_unit', type: 'varchar', nullable: true })
  capacityUnit!: string | null;

  @Column({ name: 'serial_number', type: 'varchar', nullable: true })
  serialNumber!: string | null;

  @Column({ name: 'refrigerant_gas_type', type: 'varchar', nullable: true })
  refrigerantGasType!: string | null;

  @Column({ name: 'machine_image_url', type: 'text', nullable: true })
  machineImageUrl!: string | null;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId!: string | null;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId!: string | null;

  @Column({ name: 'qr_code_id', type: 'varchar', length: 64, unique: true, nullable: true })
  qrCodeId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'asset_health_score', type: 'decimal', precision: 5, scale: 2, default: 100 })
  assetHealthScore!: string;

  @Column({ name: 'risk_level', type: 'varchar', default: 'LOW' })
  riskLevel!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ name: 'failure_probability', type: 'decimal', precision: 6, scale: 4, default: 0 })
  failureProbability!: string;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => CostCenterEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter!: CostCenterEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => VendorEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity | null;

  @ManyToOne(() => MachineModuleEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'module_id' })
  module!: MachineModuleEntity | null;
}
