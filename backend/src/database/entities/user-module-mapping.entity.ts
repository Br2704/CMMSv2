import { Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { MachineModuleEntity } from './machine-module.entity';

@Entity('user_module_mappings')
@Unique(['user', 'module'])
export class UserModuleMappingEntity extends TimestampedUuidEntity {
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => MachineModuleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_id' })
  module!: MachineModuleEntity;

  get userId(): string {
    return this.user?.id;
  }

  get moduleId(): string {
    return this.module?.id;
  }
}
