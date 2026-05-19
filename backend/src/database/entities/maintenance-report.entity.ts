import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DATETIME_COLUMN_TYPE, TimestampedUuidEntity } from './common';
import { AssetEntity } from './asset.entity';
import { PlantEntity } from './plant.entity';
import { UserEntity } from './user.entity';
import { WorkOrderEntity } from './work-order.entity';
import { MaintenanceTeamEntity } from './maintenance-team.entity';

@Entity('maintenance_reports')
export class MaintenanceReportEntity extends TimestampedUuidEntity {
  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @Column({ name: 'wo_number', type: 'varchar' })
  woNumber!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'asset_code', type: 'varchar' })
  assetCode!: string;

  @Column({ name: 'asset_name', type: 'varchar' })
  assetName!: string;

  @Column({ name: 'asset_category', type: 'varchar', nullable: true })
  assetCategory!: string | null;

  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'plant_name', type: 'varchar' })
  plantName!: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'department_name', type: 'varchar', nullable: true })
  departmentName!: string | null;

  @Column({ type: 'varchar', nullable: true })
  area!: string | null;

  @Column({ type: 'varchar', nullable: true })
  line!: string | null;

  @Column({ name: 'raised_by', type: 'uuid', nullable: true })
  raisedBy!: string | null;

  @Column({ name: 'raised_by_name', type: 'varchar', nullable: true })
  raisedByName!: string | null;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ name: 'assigned_to_name', type: 'varchar', nullable: true })
  assignedToName!: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_by_name', type: 'varchar', nullable: true })
  approvedByName!: string | null;

  @Column({ name: 'closure_date', type: DATETIME_COLUMN_TYPE })
  closureDate!: Date;

  // Problem Information
  @Column({ name: 'issue_title', type: 'varchar', nullable: true })
  issueTitle!: string | null;

  @Column({ name: 'problem_description', type: 'text', nullable: true })
  problemDescription!: string | null;

  @Column({ name: 'actual_failure_category', type: 'varchar', nullable: true })
  actualFailureCategory!: string | null;

  @Column({ name: 'failure_code', type: 'varchar', nullable: true })
  failureCode!: string | null;

  @Column({ name: 'root_cause', type: 'text', nullable: true })
  rootCause!: string | null;

  @Column({ name: 'sub_root_cause', type: 'varchar', nullable: true })
  subRootCause!: string | null;

  @Column({ name: 'operator_fault', type: 'boolean', default: false })
  operatorFault!: boolean;

  @Column({ name: 'repeat_failure', type: 'boolean', default: false })
  repeatFailure!: boolean;

  @Column({ name: 'amc_covered', type: 'boolean', default: false })
  amcCovered!: boolean;

  @Column({ name: 'breakdown_type', type: 'varchar', nullable: true })
  breakdownType!: string | null;

  // Maintenance Action
  @Column({ name: 'initial_assessment', type: 'text', nullable: true })
  initialAssessment!: string | null;

  @Column({ name: 'actual_corrective_action', type: 'text', nullable: true })
  actualCorrectiveAction!: string | null;

  @Column({ name: 'preventive_recommendation', type: 'text', nullable: true })
  preventiveRecommendation!: string | null;

  @Column({ name: 'follow_up_required', type: 'boolean', default: false })
  followUpRequired!: boolean;

  @Column({ name: 'follow_up_team_id', type: 'uuid', nullable: true })
  followUpTeamId!: string | null;

  @Column({ name: 'follow_up_status', type: 'varchar', nullable: true })
  followUpStatus!: string | null;

  @Column({ name: 'why_why_analysis', type: 'simple-json', nullable: true })
  whyWhyAnalysis!: Record<string, string> | null;

  @Column({ name: 'technician_remarks', type: 'text', nullable: true })
  technicianRemarks!: string | null;

  @Column({ name: 'closure_remarks', type: 'text', nullable: true })
  closureRemarks!: string | null;

  // Downtime Analysis (in minutes)
  @Column({ name: 'start_time', type: DATETIME_COLUMN_TYPE, nullable: true })
  startTime!: Date | null;

  @Column({ name: 'response_time', type: 'int', default: 0 })
  responseTime!: number;

  @Column({ name: 'open_time', type: 'int', default: 0 })
  openTime!: number;

  @Column({ name: 'completion_time', type: DATETIME_COLUMN_TYPE, nullable: true })
  completionTime!: Date | null;

  @Column({ name: 'approval_time', type: DATETIME_COLUMN_TYPE, nullable: true })
  approvalTime!: Date | null;

  @Column({ name: 'total_downtime', type: 'int', default: 0 })
  totalDowntime!: number;

  @Column({ name: 'actual_repair_time', type: 'int', default: 0 })
  actualRepairTime!: number;

  @Column({ name: 'waiting_time', type: 'int', default: 0 })
  waitingTime!: number;

  // Resource Usage
  @Column({ name: 'manpower_used', type: 'text', nullable: true })
  manpowerUsed!: string | null;

  @Column({ name: 'manpower_count', type: 'int', default: 0 })
  manpowerCount!: number;

  @Column({ name: 'spare_consumption', type: 'simple-json', nullable: true })
  spareConsumption!: Array<Record<string, any>> | null;

  @Column({ name: 'total_spare_cost', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalSpareCost!: string;

  @Column({ name: 'outside_vendor_involved', type: 'boolean', default: false })
  outsideVendorInvolved!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  attachments!: Array<Record<string, any>> | null;

  @ManyToOne(() => WorkOrderEntity)
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrderEntity;

  @ManyToOne(() => AssetEntity)
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => PlantEntity)
  @JoinColumn({ name: 'plant_id' })
  plant!: PlantEntity;

  @ManyToOne(() => MaintenanceTeamEntity)
  @JoinColumn({ name: 'follow_up_team_id' })
  followUpTeam!: MaintenanceTeamEntity | null;
}
