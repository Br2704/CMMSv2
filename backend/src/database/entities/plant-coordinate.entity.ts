import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { DepartmentEntity } from './department.entity';
import { GateEntity } from './gate.entity';
import { MachineModuleEntity } from './machine-module.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('plant_coordinates')
export class PlantCoordinateEntity extends TimestampedUuidEntity {
  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'gate_id', type: 'uuid', nullable: true })
  gateId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId!: string | null;

  @Column({ name: 'location_name', type: 'varchar' })
  locationName!: string;

  @Column({ name: 'location_type', type: 'varchar', default: 'KEY_LOCATION' })
  locationType!: string;

  @Column({ name: 'latitude', type: 'decimal', precision: 10, scale: 7 })
  latitude!: string;

  @Column({ name: 'longitude', type: 'decimal', precision: 10, scale: 7 })
  longitude!: string;

  @Column({ name: 'boundary_points', type: 'simple-json', nullable: true })
  boundaryPoints!: Array<{ latitude: number; longitude: number }> | null;

  @Column({ name: 'meta', type: 'simple-json', nullable: true })
  meta!: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => GateEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gate_id' })
  gate!: GateEntity | null;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => MachineModuleEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'module_id' })
  module!: MachineModuleEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
