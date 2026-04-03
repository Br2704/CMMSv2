import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { PlantEntity } from './plant.entity';
import { VendorEntity } from './vendor.entity';

export interface AmcMachineGroupConfig {
  id: string;
  name: string;
  groupType: 'MODULE' | 'CUSTOM';
  moduleIds: string[];
  assetIds: string[];
  description: string | null;
}

export interface AmcNotificationSettings {
  notifyEmail: boolean;
  notifyInApp: boolean;
  notifyOnVisitScheduled: boolean;
  notifyOnBreakdown: boolean;
  notifyOnRenewal: boolean;
  notifyOnServiceReportSubmitted: boolean;
  notifyOnServiceReportVerified: boolean;
  escalationEmails: string[];
  notifyBeforeDays: number[];
}

@Entity('amc_contracts')
export class AmcContractEntity extends TimestampedUuidEntity {
  @Column({ name: 'contract_number', type: 'varchar' })
  contractNumber!: string;

  @Column({ name: 'contract_name', type: 'varchar', nullable: true })
  contractName!: string | null;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ name: 'contract_type', type: 'varchar', nullable: true })
  contractType!: string | null;

  @Column({ name: 'visit_frequency', type: 'varchar', nullable: true })
  visitFrequency!: string | null;

  @Column({ name: 'response_time_sla', type: 'int', nullable: true })
  responseTimeSla!: number | null;

  @Column({ name: 'resolution_time_sla', type: 'int', nullable: true })
  resolutionTimeSla!: number | null;

  @Column({ name: 'contract_value', type: 'decimal', precision: 12, scale: 2, nullable: true })
  contractValue!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount!: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  terms!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'machine_groups', type: 'simple-json', nullable: true })
  machineGroups!: AmcMachineGroupConfig[] | null;

  @Column({ name: 'notification_settings', type: 'simple-json', nullable: true })
  notificationSettings!: AmcNotificationSettings | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => VendorEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
