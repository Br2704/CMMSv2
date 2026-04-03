import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { UserEntity } from './user.entity';

@Entity('refresh_tokens')
export class RefreshTokenEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: DATETIME_COLUMN_TYPE })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'session_expires_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  sessionExpiresAt!: Date | null;

  @Column({ name: 'created_ip', type: 'varchar', nullable: true })
  createdIp!: string | null;

  @Column({ name: 'created_user_agent', type: 'varchar', nullable: true })
  createdUserAgent!: string | null;

  @Column({ name: 'replaced_by_token_id', type: 'uuid', nullable: true })
  replacedByTokenId!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;
}
