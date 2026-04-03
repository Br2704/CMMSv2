import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AmcContractEntity } from './amc-contract.entity';
import { AmcVisitScheduleEntity } from './amc-visit-schedule.entity';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';
import { VendorEntity } from './vendor.entity';
import { WorkOrderEntity } from './work-order.entity';

@Entity('amc_service_reports')
export class AmcServiceReportEntity extends TimestampedUuidEntity {
  @Column({ name: 'visit_schedule_id', type: 'uuid', nullable: true })
  visitScheduleId!: string | null;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string;

  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId!: string | null;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ name: 'work_done', type: 'text' })
  workDone!: string;

  @Column({ name: 'parts_replaced', type: 'text', nullable: true })
  partsReplaced!: string | null;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

  @Column({ type: 'text', nullable: true })
  recommendations!: string | null;

  @Column({ name: 'next_service_date', type: 'date', nullable: true })
  nextServiceDate!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  attachments!: string[] | null;

  @Column({ name: 'source_type', type: 'varchar', default: 'VISIT' })
  sourceType!: string;

  @Column({ name: 'verification_status', type: 'varchar', default: 'SUBMITTED' })
  verificationStatus!: string;

  @Column({ name: 'verification_remarks', type: 'text', nullable: true })
  verificationRemarks!: string | null;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy!: string | null;

  @Column({ name: 'verified_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'response_time_minutes', type: 'int', nullable: true })
  responseTimeMinutes!: number | null;

  @Column({ name: 'resolution_time_minutes', type: 'int', nullable: true })
  resolutionTimeMinutes!: number | null;

  @ManyToOne(() => AmcVisitScheduleEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'visit_schedule_id' })
  visitSchedule!: AmcVisitScheduleEntity | null;

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
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrderEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifiedByUser!: UserEntity | null;
}
