import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { TimestampedUuidEntity } from './common';
import { RoleEntity } from './role.entity';

@Entity('role_dashboard_kpis')
@Unique('uq_role_dashboard_kpis_role_kpi', ['roleId', 'kpiKey'])
export class RoleDashboardKpiEntity extends TimestampedUuidEntity {
  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ name: 'kpi_key', type: 'varchar' })
  kpiKey!: string;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible!: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @ManyToOne(() => RoleEntity, (role) => role.dashboardKpis, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: RoleEntity;
}
