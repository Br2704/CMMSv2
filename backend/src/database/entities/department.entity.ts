import { Column, Entity, JoinColumn, ManyToOne, OneToMany, VersionColumn } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';

@Entity('departments')
export class DepartmentEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  code!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @ManyToOne(() => PlantEntity, (plant) => plant.departments, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => DepartmentEntity, (department) => department.children, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent!: DepartmentEntity | null;

  @OneToMany(() => DepartmentEntity, (department) => department.parent)
  children!: DepartmentEntity[];
}
