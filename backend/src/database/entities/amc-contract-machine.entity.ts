import { Entity, JoinColumn, ManyToOne, Unique, Column } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { AmcContractEntity } from './amc-contract.entity';
import { AssetEntity } from './asset.entity';

@Entity('amc_contract_machines')
@Unique('uq_amc_contract_machine', ['contractId', 'assetId'])
export class AmcContractMachineEntity extends TimestampedUuidEntity {
  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @ManyToOne(() => AmcContractEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract!: AmcContractEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;
}
