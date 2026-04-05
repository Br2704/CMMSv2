import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';
import { WorkOrderEntity } from './work-order.entity';

@Entity('work_order_activity_logs')
@Index('idx_wo_activity_work_order', ['workOrderId', 'createdAt'])
export class WorkOrderActivityLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @Column({ name: 'asset_id', type: 'uuid', nullable: true })
  assetId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'event_type', type: 'varchar' })
  eventType!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'safety_checklist', type: 'simple-json', nullable: true })
  safetyChecklist!: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  attachments!: Array<Record<string, unknown>> | null;

  @Column({ name: 'event_meta', type: 'simple-json', nullable: true })
  eventMeta!: Record<string, unknown> | null;

  @Column({ name: 'occurred_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  occurredAt!: Date | null;

  @ManyToOne(() => WorkOrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrderEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser!: UserEntity | null;
}
