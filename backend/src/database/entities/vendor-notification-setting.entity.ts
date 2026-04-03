import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { VendorEntity } from './vendor.entity';

@Entity('vendor_notification_settings')
@Unique('uq_vendor_notification_plant', ['vendorId', 'plantId'])
export class VendorNotificationSettingEntity extends TimestampedUuidEntity {
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string;

  @Column({ name: 'notify_email', type: 'boolean', default: true })
  notifyEmail!: boolean;

  @Column({ name: 'notify_in_app', type: 'boolean', default: true })
  notifyInApp!: boolean;

  @Column({ name: 'notify_before_days', type: 'simple-json', default: '[30,15,7]' })
  notifyBeforeDays!: number[];

  @Column({ name: 'notify_on_renewal_due', type: 'boolean', default: true })
  notifyOnRenewalDue!: boolean;

  @Column({ name: 'contact_emails', type: 'simple-json', default: '[]' })
  contactEmails!: string[];

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @ManyToOne(() => VendorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
