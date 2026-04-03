import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { DepartmentEntity } from './department.entity';
import { PlantEntity } from './plant.entity';

@Entity('cost_centers')
export class CostCenterEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar' })
  code!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
