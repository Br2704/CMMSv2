import { Column, Entity, JoinColumn, ManyToOne, VersionColumn } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { MaintenanceTeamEntity } from './maintenance-team.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';
import { VendorEntity } from './vendor.entity';

@Entity('work_orders')
export class WorkOrderEntity extends TimestampedUuidEntity {
  @Column({ name: 'wo_number', type: 'varchar', unique: true })
  woNumber!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'varchar', default: 'MEDIUM' })
  priority!: string;

  @Column({ type: 'varchar', default: 'RAISED' })
  status!: string;

  @Column({ name: 'problem_description', type: 'text' })
  problemDescription!: string;

  @Column({ name: 'raised_by', type: 'uuid', nullable: true })
  raisedBy!: string | null;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ name: 'opened_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  openedAt!: Date | null;

  @Column({ name: 'closed_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'started_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'resolved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'downtime_start_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  downtimeStartAt!: Date | null;

  @Column({ name: 'downtime_end_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  downtimeEndAt!: Date | null;

  @Column({ name: 'accepted_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'escalation_level', type: 'int', nullable: true })
  escalationLevel!: number | null;

  @Column({ name: 'sla_due_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  slaDueAt!: Date | null;

  @Column({ name: 'is_failure_event', type: 'boolean', default: false })
  isFailureEvent!: boolean;

  @Column({ name: 'root_cause', type: 'text', nullable: true })
  rootCause!: string | null;

  @Column({ name: 'action_taken', type: 'text', nullable: true })
  actionTaken!: string | null;

  @Column({ name: 'downtime_minutes', type: 'int', default: 0 })
  downtimeMinutes!: number;

  @Column({ name: 'operator_fault', type: 'boolean', default: false })
  operatorFault!: boolean;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'plant_id', type: 'uuid', nullable: true })
  plantId!: string | null;

  @Column({ name: 'wo_type', type: 'varchar', default: 'BREAKDOWN' })
  woType!: string;

  @Column({ name: 'reported_location', type: 'varchar', nullable: true })
  reportedLocation!: string | null;

  @Column({ name: 'failure_code', type: 'varchar', nullable: true })
  failureCode!: string | null;

  @Column({ name: 'sub_category', type: 'varchar', nullable: true })
  subCategory!: string | null;

  @Column({ name: 'labor_hours', type: 'decimal', precision: 10, scale: 2, default: 0 })
  laborHours!: string;

  @Column({ name: 'actual_cost', type: 'decimal', precision: 12, scale: 2, default: 0 })
  actualCost!: string;

  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId!: string | null;

  @Column({ name: 'warranty_claim', type: 'boolean', default: false })
  warrantyClaim!: boolean;

  @Column({ name: 'safety_related', type: 'boolean', default: false })
  safetyRelated!: boolean;

  @Column({ name: 'parts_replaced', type: 'text', nullable: true })
  partsReplaced!: string | null;

  @Column({ name: 'spare_consumption', type: 'simple-json', nullable: true })
  spareConsumption!: Array<Record<string, unknown>> | null;

  @Column({ type: 'simple-json', nullable: true })
  attachments!: Array<Record<string, unknown>> | null;

  @Column({ name: 'safety_checklist', type: 'simple-json', nullable: true })
  safetyChecklist!: Record<string, unknown> | null;

  @Column({ name: 'technician_verification', type: 'simple-json', nullable: true })
  technicianVerification!: Record<string, unknown> | null;

  @Column({ name: 'cancelled_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ name: 'submitted_for_approval_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  submittedForApprovalAt!: Date | null;

  @Column({ name: 'submitted_for_approval_by', type: 'uuid', nullable: true })
  submittedForApprovalBy!: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy!: string | null;

  @Column({ name: 'rejected_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'approval_comments', type: 'text', nullable: true })
  approvalComments!: string | null;

  @Column({ name: 'admin_override_by', type: 'uuid', nullable: true })
  adminOverrideBy!: string | null;

  @Column({ name: 'admin_override_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  adminOverrideAt!: Date | null;

  @Column({ name: 'admin_override_reason', type: 'text', nullable: true })
  adminOverrideReason!: string | null;

  @Column({ name: 'follow_up_required', type: 'boolean', default: false })
  followUpRequired!: boolean;

  @Column({ name: 'follow_up_team_id', type: 'uuid', nullable: true })
  followUpTeamId!: string | null;

  @Column({ name: 'follow_up_notes', type: 'text', nullable: true })
  followUpNotes!: string | null;

  @Column({ type: 'varchar', nullable: true })
  shift!: string | null;

  @Column({ name: 'breakdown_type', type: 'varchar', nullable: true })
  breakdownType!: string | null;

  @Column({ name: 'initial_assessment', type: 'text', nullable: true })
  initialAssessment!: string | null;

  @Column({ name: 'expected_completion_at', type: DATETIME_COLUMN_TYPE, nullable: true })
  expectedCompletionAt!: Date | null;

  @Column({ name: 'work_permit_required', type: 'boolean', default: false })
  workPermitRequired!: boolean;

  @Column({ name: 'loto_required', type: 'boolean', default: false })
  lotoRequired!: boolean;

  @Column({ name: 'actual_failure_category', type: 'varchar', nullable: true })
  actualFailureCategory!: string | null;

  @Column({ name: 'why_why_analysis', type: 'simple-json', nullable: true })
  whyWhyAnalysis!: Record<string, string> | null;

  @Column({ name: 'preventive_recommendation', type: 'text', nullable: true })
  preventiveRecommendation!: string | null;

  @Column({ name: 'manpower_used', type: 'text', nullable: true })
  manpowerUsed!: string | null;

  @Column({ name: 'parent_work_order_id', type: 'uuid', nullable: true })
  parentWorkOrderId!: string | null;

  @Column({ name: 'machine_running', type: 'boolean', default: false })
  machineRunning!: boolean;

  @Column({ name: 'verification_required', type: 'boolean', default: false })
  verificationRequired!: boolean;

  @Column({ name: 'active_shift_id', type: 'uuid', nullable: true })
  activeShiftId!: string | null;

  @Column({ name: 'carry_forward_count', type: 'int', default: 0 })
  carryForwardCount!: number;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @ManyToOne(() => AssetEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'raised_by' })
  raisedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to' })
  assignedToUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submitted_for_approval_by' })
  submittedForApprovalByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rejected_by' })
  rejectedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'admin_override_by' })
  adminOverrideByUser!: UserEntity | null;

  @ManyToOne(() => PlantEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity | null;

  @ManyToOne(() => VendorEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity | null;

  @ManyToOne(() => MaintenanceTeamEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'follow_up_team_id' })
  followUpTeam!: MaintenanceTeamEntity | null;

  @ManyToOne(() => WorkOrderEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_work_order_id' })
  parentWorkOrder!: WorkOrderEntity | null;
}
