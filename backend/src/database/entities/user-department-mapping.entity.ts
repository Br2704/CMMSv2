import { Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { DepartmentEntity } from './department.entity';

@Entity('user_department_mappings')
@Unique(['user', 'department'])
export class UserDepartmentMappingEntity extends TimestampedUuidEntity {
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => DepartmentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentEntity;

  get userId(): string {
    return this.user?.id;
  }

  get departmentId(): string {
    return this.department?.id;
  }
}
