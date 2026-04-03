import { Column, Entity, JoinColumn, ManyToOne, VersionColumn } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { PlantEntity } from './plant.entity';

@Entity('asset_performance_logs')
export class AssetPerformanceLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'captured_at', type: DATETIME_COLUMN_TYPE })
  capturedAt!: Date;

  @Column({ name: 'runtime_hours', type: 'decimal', precision: 14, scale: 3, nullable: true })
  runtimeHours!: string | null;

  @Column({ name: 'energy_kwh', type: 'decimal', precision: 14, scale: 3, nullable: true })
  energyKwh!: string | null;

  @Column({ name: 'production_output', type: 'decimal', precision: 14, scale: 3, nullable: true })
  productionOutput!: string | null;

  @Column({ name: 'efficiency_value', type: 'decimal', precision: 14, scale: 4, nullable: true })
  efficiencyValue!: string | null;

  @Column({ name: 'efficiency_unit', type: 'varchar', nullable: true })
  efficiencyUnit!: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;
}
