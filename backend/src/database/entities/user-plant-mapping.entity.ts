import { Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { PlantEntity } from './plant.entity';

@Entity('user_plant_mappings')
@Unique(['user', 'plant'])
export class UserPlantMappingEntity extends TimestampedUuidEntity {
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  get userId(): string {
    return this.user?.id;
  }

  get plantId(): string {
    return this.plant?.id;
  }
}
