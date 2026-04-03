import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AmcContractEntity } from './amc-contract.entity';
import { AssetEntity } from './asset.entity';
import { VendorEntity } from './vendor.entity';
import { WorkOrderEntity } from './work-order.entity';

@Entity('amc_visit_schedule')
@Unique('uq_amc_visit_contract_asset_date', ['contractId', 'assetId', 'visitDate'])
export class AmcVisitScheduleEntity extends TimestampedUuidEntity {
  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string;

  @Column({ name: 'visit_date', type: 'date' })
  visitDate!: string;

  @Column({ type: 'varchar', default: 'SCHEDULED' })
  status!: string;

  @Column({ name: 'service_task_id', type: 'uuid', nullable: true })
  serviceTaskId!: string | null;

  @Column({ name: 'notification_sent_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  notificationSentAt!: Date | null;

  @ManyToOne(() => AmcContractEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract!: AmcContractEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => VendorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity;

  @ManyToOne(() => WorkOrderEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'service_task_id' })
  serviceTask!: WorkOrderEntity | null;
}
