import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { SpareItemEntity } from './spare-item.entity';
import { UserEntity } from './user.entity';
import { WorkOrderEntity } from './work-order.entity';

@Entity('stock_requests')
export class StockRequestEntity extends TimestampedUuidEntity {
  @Column({ name: 'spare_item_id', type: 'uuid' })
  spareItemId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy!: string;

  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId!: string | null;

  @Column({ type: 'varchar', default: 'REQUESTED' })
  status!: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @ManyToOne(() => SpareItemEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'spare_item_id' })
  spareItem!: SpareItemEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requestedByUser!: UserEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedByUser!: UserEntity | null;

  @ManyToOne(() => WorkOrderEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrderEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
