import { Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';
import { AssetEntity } from './asset.entity';

@Entity('user_machine_mappings')
@Unique(['user', 'asset'])
export class UserMachineMappingEntity extends TimestampedUuidEntity {
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  get userId(): string {
    return this.user?.id;
  }

  get assetId(): string {
    return this.asset?.id;
  }
}
