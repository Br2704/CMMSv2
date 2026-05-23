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
  // NOTE: Column name must match the database column names created by migration 0055 (snake_case)

  @Column({ name: 'sheets_config', type: 'text', nullable: true, comment: 'JSON array of sheet configurations' })
  sheetsConfig!: string | null;

  @Column({ name: 'chart_config', type: 'text', nullable: true, comment: 'JSON configuration for charts' })
  chartConfig!: string | null;

  @Column({ name: 'cell_defaults', type: 'text', nullable: true, comment: 'JSON default cell formatting settings' })
  cellDefaults!: string | null;

  @Column({ name: 'report_data_source', type: 'varchar', length: 100, nullable: true, default: 'work_orders' })
  reportDataSource!: string | null;

  @Column({ name: 'default_date_range', type: 'int', nullable: true, default: 30 })
  defaultDateRange!: number | null;

  @Column({ name: 'organization_logo_url', type: 'text', nullable: true })
  organizationLogoUrl!: string | null;

  @Column({ name: 'tamoptix_logo_url', type: 'text', nullable: true, default: '/tamoptix/tamoptix-logo.svg' })
  tamoptixLogoUrl!: string | null;

  @Column({ name: 'report_locale', type: 'varchar', length: 10, nullable: true, default: 'en' })
  reportLocale!: string | null;

  @Column({ name: 'default_cell_width', type: 'int', nullable: true, default: 120 })
  defaultCellWidth!: number | null;

  @Column({ name: 'default_cell_height', type: 'int', nullable: true, default: 30 })
  defaultCellHeight!: number | null;

  @Column({ name: 'show_row_striping', type: 'boolean', nullable: true, default: true })
  showRowStriping!: boolean | null;

  @Column({ name: 'page_orientation', type: 'varchar', length: 20, nullable: true, default: 'portrait' })
  pageOrientation!: string | null;

  @Column({ name: 'paper_size', type: 'varchar', length: 20, nullable: true, default: 'A4' })
  paperSize!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: DATETIME_COLUMN_TYPE })
  updatedAt!: Date;
}
