import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { DepartmentEntity } from './department.entity';
import { GateEntity } from './gate.entity';
import { MachineModuleEntity } from './machine-module.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('gate_entry_types')
export class GateEntryTypeEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_id', type: 'uuid' })
  gateId!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'template_name', type: 'varchar' })
  templateName!: string;

  @Column({ name: 'visitor_type', type: 'varchar' })
  visitorType!: string;

  @Column({ name: 'allowed_roles', type: 'simple-json', nullable: true })
  allowedRoles!: string[] | null;

  @Column({ name: 'frequency', type: 'varchar', nullable: true })
  frequency!: string | null;

  @Column({ name: 'security_level', type: 'varchar', nullable: true })
  securityLevel!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId!: string | null;

  @Column({ name: 'machine_id', type: 'uuid', nullable: true })
  machineId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => GateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_id' })
  gate!: GateEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity | null;

  @ManyToOne(() => MachineModuleEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'module_id' })
  module!: MachineModuleEntity | null;

  @ManyToOne(() => AssetEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'machine_id' })
  machine!: AssetEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
