import { Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { ShiftEntity } from './shift.entity';

@Entity('user_shift_mappings')
@Unique(['user', 'shift'])
export class UserShiftMappingEntity extends TimestampedUuidEntity {
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => ShiftEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shift_id' })
  shift!: ShiftEntity;

  get userId(): string {
    return this.user?.id;
  }

  get shiftId(): string {
    return this.shift?.id;
  }
}
