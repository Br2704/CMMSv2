import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('system_configs')
export class SystemConfigEntity {
  @PrimaryColumn({ name: 'config_key', type: 'varchar', length: 100 })
  configKey!: string;

  @Column({ name: 'config_value', type: 'jsonb', nullable: true })
  configValue!: any;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_modified_at', type: 'timestamp', nullable: true })
  lastModifiedAt?: Date;

  @Column({ name: 'last_modified_by', type: 'uuid', nullable: true })
  lastModifiedBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
