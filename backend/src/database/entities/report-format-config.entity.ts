import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { DATETIME_COLUMN_TYPE } from './common';

@Entity('report_format_config')
export class ReportFormatConfigEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 500, default: 'CMMS Report' })
  headerTitle!: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  headerSubtitle!: string;

  @Column({ type: 'varchar', length: 200, default: 'Powered by TamOptiX Technologies' })
  footerText!: string;

  @Column({ type: 'varchar', length: 500, default: 'TamOptiX Technologies | Intelligent CMMS Platform' })
  footerSubtext!: string;

  @Column({ type: 'boolean', default: true })
  showTamOptixBranding!: boolean;

  @Column({ type: 'boolean', default: true })
  showOrganizationLogo!: boolean;

  @Column({ type: 'boolean', default: true })
  showGeneratedDate!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'left' })
  logoAlignment!: string;

  @Column({ type: 'varchar', length: 50, default: '#000000' })
  headerColor!: string;

  @Column({ type: 'varchar', length: 50, default: '#6B7280' })
  footerColor!: string;

  @Column({ type: 'int', default: 14 })
  headerFontSize!: number;

  @Column({ type: 'int', default: 8 })
  footerFontSize!: number;

  @Column({ type: 'varchar', length: 50, default: '#111827' })
  primaryColor!: string;

  @Column({ type: 'varchar', length: 50, default: '#000000' })
  headerBgColor!: string;

  @Column({ type: 'boolean', default: true })
  headerBold!: boolean;

  @Column({ type: 'boolean', default: true })
  footerBold!: boolean;

  @Column({ type: 'boolean', default: true })
  headerUnderline!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'left' })
  headerAlignment!: string;

  // ── Advanced Config Columns ──

  @Column({ type: 'text', nullable: true, comment: 'JSON array of sheet configurations' })
  sheetsConfig!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'JSON configuration for charts' })
  chartConfig!: string | null;

  @Column({ type: 'text', nullable: true, comment: 'JSON default cell formatting settings' })
  cellDefaults!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'work_orders' })
  reportDataSource!: string | null;

  @Column({ type: 'int', nullable: true, default: 30 })
  defaultDateRange!: number | null;

  @Column({ type: 'text', nullable: true })
  organizationLogoUrl!: string | null;

  @Column({ type: 'text', nullable: true, default: '/tamoptix/tamoptix-logo.svg' })
  tamoptixLogoUrl!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true, default: 'en' })
  reportLocale!: string | null;

  @Column({ type: 'int', nullable: true, default: 120 })
  defaultCellWidth!: number | null;

  @Column({ type: 'int', nullable: true, default: 30 })
  defaultCellHeight!: number | null;

  @Column({ type: 'boolean', nullable: true, default: true })
  showRowStriping!: boolean | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'portrait' })
  pageOrientation!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'A4' })
  paperSize!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: DATETIME_COLUMN_TYPE })
  updatedAt!: Date;
}
