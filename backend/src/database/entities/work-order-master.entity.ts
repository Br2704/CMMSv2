import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';

@Entity('work_order_masters')
@Unique('uq_work_order_masters_plant_type_code', ['plantId', 'optionType', 'code'])
export class WorkOrderMasterEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'option_type', type: 'varchar' })
  optionType!: string;

  @Column({ type: 'varchar' })
  code!: string;

  @Column({ type: 'varchar' })
  label!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;
}
