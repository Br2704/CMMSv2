import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity, DATETIME_COLUMN_TYPE } from './common';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';
import { PlantEntity } from './plant.entity';

@Entity('warranty_alerts')
export class WarrantyAlertEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'machine_id', type: 'uuid' })
  machineId!: string;

  @Column({ type: 'varchar', default: 'OPEN' })
  status!: string; // OPEN, CLOSED

  @Column({ type: 'varchar', nullable: true })
  remarks!: string | null;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy!: string | null;

  @Column({ name: 'closed_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  closedAt!: Date | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'machine_id' })
  machine!: AssetEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'closed_by' })
  closer!: UserEntity | null;
}
