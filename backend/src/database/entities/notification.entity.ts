import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { PlantEntity } from './plant.entity';

@Entity('notifications')
export class NotificationEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  link!: string | null;

  @Column({ name: 'wo_id', type: 'uuid', nullable: true })
  woId!: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ type: 'varchar', default: 'OPEN' }) // OPEN, CLOSED
  status!: string;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
