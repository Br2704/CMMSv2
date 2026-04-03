import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { VendorEntity } from './vendor.entity';

@Entity('vendor_user_mappings')
@Unique('uq_vendor_user_mapping', ['vendorId', 'userId'])
export class VendorUserMappingEntity extends TimestampedUuidEntity {
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => VendorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;
}
