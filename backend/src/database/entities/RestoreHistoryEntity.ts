import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { BackupHistoryEntity } from './BackupHistoryEntity';

@Entity('restore_history')
export class RestoreHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  @Index()
  backupId!: string;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  @Index()
  status!: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';

  @Column({ type: 'uuid' })
  @Index()
  initiatedById!: string;

  @Column({ type: 'text', nullable: true })
  logs!: string | null;

  @Column({ type: 'int', nullable: true })
  durationMs!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => BackupHistoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'backupId' })
  backup?: BackupHistoryEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'initiatedById' })
  initiatedBy?: UserEntity;
}
