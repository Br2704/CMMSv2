import { Column, Entity, Index } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('push_subscriptions')
@Index(['userId', 'endpoint'], { unique: true })
export class PushSubscriptionEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ type: 'simple-json' })
  keys!: { p256dh: string; auth: string };

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt!: Date | null;
}
