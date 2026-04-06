import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { GateEntryEntity } from './gate-entry.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';

@Entity('visitor_safety_log')
export class VisitorSafetyLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'visitor_id', type: 'uuid' })
  visitorId!: string;

  @Column({ name: 'gate_entry_id', type: 'uuid', nullable: true })
  gateEntryId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'consent_given', type: 'boolean', default: true })
  consentGiven!: boolean;

  @Column({ name: 'consented_at', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  consentedAt!: Date;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'device_info', type: LARGE_TEXT_COLUMN_TYPE, nullable: true })
  deviceInfo!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visitor_id' })
  visitor!: UserEntity;

  @ManyToOne(() => GateEntryEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gate_entry_id' })
  gateEntry!: GateEntryEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
