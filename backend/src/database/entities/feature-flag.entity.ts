import { Column, Entity, Unique, VersionColumn } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('feature_flags')
@Unique('uq_feature_flags_key_env', ['key', 'environment'])
export class FeatureFlagEntity extends TimestampedUuidEntity {
  @Column({ type: 'varchar' })
  key!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'varchar', default: 'all' })
  environment!: string;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;
}
