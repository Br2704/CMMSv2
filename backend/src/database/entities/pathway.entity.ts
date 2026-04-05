import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantCoordinateEntity } from './plant-coordinate.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('pathways')
export class PathwayEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'pathway_name', type: 'varchar' })
  pathwayName!: string;

  @Column({ name: 'path_type', type: 'varchar', default: 'WALKABLE' })
  pathType!: string;

  @Column({ name: 'start_coordinate_id', type: 'uuid', nullable: true })
  startCoordinateId!: string | null;

  @Column({ name: 'end_coordinate_id', type: 'uuid', nullable: true })
  endCoordinateId!: string | null;

  @Column({ name: 'corner_points', type: 'simple-json', nullable: true })
  cornerPoints!: Array<{ latitude: number; longitude: number }> | null;

  @Column({ name: 'route_meta', type: 'simple-json', nullable: true })
  routeMeta!: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => PlantCoordinateEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'start_coordinate_id' })
  startCoordinate!: PlantCoordinateEntity | null;

  @ManyToOne(() => PlantCoordinateEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'end_coordinate_id' })
  endCoordinate!: PlantCoordinateEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
