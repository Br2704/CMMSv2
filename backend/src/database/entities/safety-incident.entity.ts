import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';
import { WorkOrderEntity } from './work-order.entity';

@Entity('safety_incidents')
export class SafetyIncidentEntity extends TimestampedUuidEntity {
  @Column({ name: 'incident_number', type: 'varchar', unique: true })
  incidentNumber!: string;

  @Column({ name: 'incident_type', type: 'varchar' })
  incidentType!: string;

  @Column({ type: 'varchar', default: 'LOW' })
  severity!: string;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'immediate_action', type: 'text', nullable: true })
  immediateAction!: string | null;

  @Column({ name: 'root_cause', type: 'text', nullable: true })
  rootCause!: string | null;

  @Column({ name: 'corrective_action', type: 'text', nullable: true })
  correctiveAction!: string | null;

  @Column({ name: 'reported_by', type: 'uuid', nullable: true })
  reportedBy!: string | null;

  @Column({ name: 'investigated_by', type: 'uuid', nullable: true })
  investigatedBy!: string | null;

  @Column({ type: 'varchar', default: 'OPEN' })
  status!: string;

  @Column({ name: 'incident_date', type: DATETIME_COLUMN_TYPE, default: () => 'CURRENT_TIMESTAMP' })
  incidentDate!: Date;

  @Column({ name: 'closure_date', type: DATETIME_COLUMN_TYPE, nullable: true })
  closureDate!: Date | null;

  @Column({ name: 'lost_time_hours', type: 'decimal', precision: 10, scale: 2, default: 0 })
  lostTimeHours!: string;

  @Column({ name: 'people_involved', type: 'int', default: 0 })
  peopleInvolved!: number;

  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reported_by' })
  reportedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'investigated_by' })
  investigatedByUser!: UserEntity | null;

  @ManyToOne(() => WorkOrderEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrderEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;
}
