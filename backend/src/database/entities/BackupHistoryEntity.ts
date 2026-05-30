import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { OrganizationEntity } from './organization.entity';
import { PlantEntity } from './plant.entity';

@Entity('backup_history')
export class BackupHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  type!: 'FULL' | 'ORGANIZATION' | 'PLANT' | 'MODULE';

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  @Index()
  status!: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';

  @Column({ type: 'varchar', length: 1024, nullable: true })
  storagePath!: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes!: number | null;

  @Column({ type: 'int', default: 0 })
  progressPercent!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  checksum!: string | null;

  @Column({ type: 'boolean', default: true })
  isEncrypted!: boolean;

  @Column({ type: 'boolean', default: true })
  isCompressed!: boolean;

  @Column({ type: 'boolean', default: false })
  includesFiles!: boolean;

  @Column({ type: 'boolean', default: false })
  includesAuditLogs!: boolean;

  @Column({ type: 'boolean', default: true })
  includesUserData!: boolean;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  plantId!: string | null;

  @Column({ type: 'uuid' })
  @Index()
  initiatedById!: string;

  @Column({ type: 'timestamp', nullable: true })
  retentionExpiryAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  errorLogs!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'initiatedById' })
  initiatedBy?: UserEntity;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization?: OrganizationEntity;

  @ManyToOne(() => PlantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plantId' })
  plant?: PlantEntity;
}
