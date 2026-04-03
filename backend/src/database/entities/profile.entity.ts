import { Column, Entity, JoinColumn, ManyToOne, OneToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('profiles')
@Unique('uq_profiles_user_id', ['userId'])
export class ProfileEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @Column({ name: 'user_code', type: 'varchar', unique: true })
  userCode!: string;

  @Column({ name: 'full_name', type: 'varchar' })
  fullName!: string;

  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ name: 'profile_image_url', type: 'text', nullable: true })
  profileImageUrl!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  department!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToOne(() => UserEntity, (user) => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
