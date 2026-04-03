import { Column, Entity } from 'typeorm';
import { TimestampedUuidEntity } from './common';

@Entity('audit_logs')
export class AuditLogEntity extends TimestampedUuidEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar', nullable: true })
  module!: string | null;

  @Column({ name: 'entity_name', type: 'varchar', nullable: true })
  entityName!: string | null;

  @Column({ name: 'entity_id', type: 'varchar', nullable: true })
  entityId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  method!: string | null;

  @Column({ type: 'varchar', nullable: true })
  path!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode!: number | null;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null;
}
