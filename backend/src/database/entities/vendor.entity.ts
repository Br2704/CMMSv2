import { Column, Entity } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('vendors')
export class VendorEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar', unique: true })
  code!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ name: 'contact_person', type: 'varchar', nullable: true })
  contactPerson!: string | null;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'gst_number', type: 'varchar', nullable: true })
  gstNumber!: string | null;

  @Column({ type: 'varchar', nullable: true })
  category!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
