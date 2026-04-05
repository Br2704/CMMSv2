import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('plant_layouts')
export class PlantLayoutEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'layout_name', type: 'varchar', default: 'Plant Layout' })
  layoutName!: string;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'svg_markup', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  svgMarkup!: string | null;

  @Column({ name: 'map_data', type: 'simple-json', nullable: true })
  mapData!: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'published_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
