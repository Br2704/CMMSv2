import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('geo_fences')
export class GeoFenceEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'fence_name', type: 'varchar' })
  fenceName!: string;

  @Column({ name: 'fence_type', type: 'varchar', default: 'ALLOWED' })
  fenceType!: string;

  @Column({ name: 'polygon_points', type: 'simple-json' })
  polygonPoints!: Array<{ latitude: number; longitude: number }>;

  @Column({ name: 'alert_on_violation', type: 'boolean', default: true })
  alertOnViolation!: boolean;

  @Column({ name: 'active_from', type: DATETIME_COLUMN_TYPE, nullable: true })
  activeFrom!: Date | null;

  @Column({ name: 'active_to', type: DATETIME_COLUMN_TYPE, nullable: true })
  activeTo!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
