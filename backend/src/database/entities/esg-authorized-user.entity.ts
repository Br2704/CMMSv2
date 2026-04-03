import { Column, Entity, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('esg_authorized_users')
@Unique('uq_esg_authorized_users_plant_category_user', ['plantId', 'esgCategory', 'userId'])
export class EsgAuthorizedUserEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'esg_category', type: 'varchar' })
  esgCategory!: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;
}
