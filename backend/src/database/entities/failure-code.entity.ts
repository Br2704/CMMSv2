import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PlantEntity } from './plant.entity';
import { DepartmentEntity } from './department.entity';
import { MachineModuleEntity } from './machine-module.entity';
import { AssetEntity } from './asset.entity';

@Entity('failure_codes')
export class FailureCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @ManyToOne(() => PlantEntity)
  @JoinColumn({ name: 'plant_id' })
  plant?: PlantEntity;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => DepartmentEntity)
  @JoinColumn({ name: 'department_id' })
  department?: DepartmentEntity;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId!: string | null;

  @ManyToOne(() => MachineModuleEntity)
  @JoinColumn({ name: 'module_id' })
  module?: MachineModuleEntity;

  @Column({ name: 'asset_id', type: 'uuid', nullable: true })
  assetId!: string | null;

  @ManyToOne(() => AssetEntity)
  @JoinColumn({ name: 'asset_id' })
  asset?: AssetEntity;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'varchar' })
  code!: string;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt!: Date | null;
}
