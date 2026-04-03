import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';

@Entity('asset_qr')
@Index('uq_asset_qr_asset_id', ['assetId'], { unique: true })
@Index('uq_asset_qr_qr_token', ['qrToken'], { unique: true })
export class AssetQrEntity extends TimestampedUuidEntity {
  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'qr_token', type: 'varchar', length: 128 })
  qrToken!: string;

  @Column({ name: 'rotated_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  rotatedAt!: Date | null;

  @OneToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;
}
