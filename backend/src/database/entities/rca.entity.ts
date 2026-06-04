import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AssetEntity } from './asset.entity';
import { WorkOrderEntity } from './work-order.entity';
import { UserEntity } from './user.entity';

@Entity('rcas')
export class RcaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'wo_id', type: 'uuid' })
  woId!: string;

  @ManyToOne(() => WorkOrderEntity)
  @JoinColumn({ name: 'wo_id' })
  workOrder?: WorkOrderEntity;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @ManyToOne(() => AssetEntity)
  @JoinColumn({ name: 'asset_id' })
  asset?: AssetEntity;

  @Column({ name: 'problem_statement', type: 'text' })
  problemStatement!: string;

  @Column({ name: 'why_1', type: 'text' })
  why1!: string;

  @Column({ name: 'why_2', type: 'text', nullable: true })
  why2!: string | null;

  @Column({ name: 'why_3', type: 'text', nullable: true })
  why3!: string | null;

  @Column({ name: 'why_4', type: 'text', nullable: true })
  why4!: string | null;

  @Column({ name: 'why_5', type: 'text', nullable: true })
  why5!: string | null;

  @Column({ name: 'root_cause', type: 'text' })
  rootCause!: string;

  @Column({ name: 'corrective_action', type: 'text' })
  correctiveAction!: string;

  @Column({ name: 'preventive_action', type: 'text' })
  preventiveAction!: string;

  @Column({ name: 'evidence_urls', type: 'simple-json', nullable: true })
  evidenceUrls!: string[] | null;

  @Column({ type: 'varchar', default: 'DRAFT' }) // DRAFT, PENDING_APPROVAL, APPROVED, REJECTED
  status!: string;

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy!: string | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'submitted_by' })
  submitter?: UserEntity;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'approved_by' })
  approver?: UserEntity;

  @Column({ name: 'approval_comments', type: 'text', nullable: true })
  approvalComments!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt!: Date | null;
}
