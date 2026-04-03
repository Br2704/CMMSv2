import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AssetEntity } from './asset.entity';
import { TimestampedUuidEntity } from './common';

@Entity('machine_instruments')
@Unique('uq_machine_instruments_asset_serial', ['assetId', 'serialNumber'])
export class MachineInstrumentEntity extends TimestampedUuidEntity {
  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'instrument_name', type: 'varchar' })
  instrumentName!: string;

  @Column({ name: 'instrument_type', type: 'varchar' })
  instrumentType!: string;

  @Column({ name: 'serial_number', type: 'varchar', nullable: true })
  serialNumber!: string | null;

  @Column({ name: 'range_min', type: 'decimal', precision: 18, scale: 3, nullable: true })
  rangeMin!: string | null;

  @Column({ name: 'range_max', type: 'decimal', precision: 18, scale: 3, nullable: true })
  rangeMax!: string | null;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ name: 'installation_date', type: 'date', nullable: true })
  installationDate!: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: string;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;
}
