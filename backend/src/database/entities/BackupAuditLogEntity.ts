import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('backup_audit_logs')
export class BackupAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  action!: 'CREATE' | 'DOWNLOAD' | 'DELETE' | 'RESTORE' | 'FAILED_RESTORE' | 'UNAUTHORIZED_ACCESS';

  @Column({ type: 'varchar', length: 50 })
  status!: 'SUCCESS' | 'FAILED' | 'DENIED';

  @Column({ type: 'uuid', nullable: true })
  @Index()
  backupId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;
}
