import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';

@Entity('shifts')
export class ShiftEntity extends TimestampedUuidEntity {
  @Column({ name: 'shift_name', type: 'varchar' })
  shiftName!: string;

  @Column({ name: 'start_time', type: 'varchar' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'varchar' })
  endTime!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => PlantEntity, (plant) => plant.shifts, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
