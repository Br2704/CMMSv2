import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';

@Entity('gates')
export class GateEntity extends TimestampedUuidEntity {
  @Column({ name: 'gate_code', type: 'varchar', unique: true })
  gateCode!: string;

  @Column({ name: 'gate_name', type: 'varchar' })
  gateName!: string;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'gate_type', type: 'varchar', default: 'MAIN_GATE' })
  gateType!: string;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  @Column({ name: 'security_user_ids', type: 'simple-json', nullable: true })
  securityUserIds!: string[] | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
