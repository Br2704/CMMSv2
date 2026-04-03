import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AssetEntity } from './asset.entity';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';

@Entity('spare_items')
export class SpareItemEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar', unique: true })
  code!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  category!: string | null;

  @Column({ name: 'current_stock', type: 'int', default: 0 })
  currentStock!: number;

  @Column({ name: 'min_level', type: 'int', default: 0 })
  minLevel!: number;

  @Column({ name: 'reorder_level', type: 'int', default: 0 })
  reorderLevel!: number;

  @Column({ type: 'varchar', default: 'Pcs' })
  unit!: string;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  @Column({ name: 'asset_id', type: 'uuid', nullable: true })
  assetId!: string | null;

  @Column({ name: 'is_critical', type: 'boolean', default: false })
  isCritical!: boolean;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity | null;
}
