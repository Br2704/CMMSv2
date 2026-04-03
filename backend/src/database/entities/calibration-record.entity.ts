import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';
import { VendorEntity } from './vendor.entity';

@Entity('calibration_records')
export class CalibrationRecordEntity extends TimestampedUuidEntity {
  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'calibration_date', type: 'date', nullable: true })
  calibrationDate!: string | null;

  @Column({ name: 'next_due_date', type: 'date' })
  nextDueDate!: string;

  @Column({ type: 'varchar', default: 'SCHEDULED' })
  status!: string;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy!: string | null;

  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId!: string | null;

  @Column({ name: 'certificate_number', type: 'varchar', nullable: true })
  certificateNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performed_by' })
  performedByUser!: UserEntity | null;

  @ManyToOne(() => VendorEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
