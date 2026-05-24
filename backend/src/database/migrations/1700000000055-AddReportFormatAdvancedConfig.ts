import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddReportFormatAdvancedConfig1700000000055 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('report_format_config');
    if (!table) return;

    // Add sheets_config JSON column for multi-sheet support
    if (!table.columns.find((col) => col.name === 'sheets_config')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'sheets_config',
          type: 'text',
          isNullable: true,
          comment: 'JSON array of sheet configurations with columns, rows, cell formatting, charts, and data sources',
        }),
      );
    }

    // Add chart_config JSON column
    if (!table.columns.find((col) => col.name === 'chart_config')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'chart_config',
          type: 'text',
          isNullable: true,
          comment: 'JSON configuration for charts (type, data source, appearance)',
        }),
      );
    }

    // Add cell_defaults JSON column for default cell formatting
    if (!table.columns.find((col) => col.name === 'cell_defaults')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'cell_defaults',
          type: 'text',
          isNullable: true,
          comment: 'JSON default cell formatting settings (height, width, colors, font)',
        }),
      );
    }

    // Add report_data_source column
    if (!table.columns.find((col) => col.name === 'report_data_source')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'report_data_source',
          type: 'varchar',
          length: '100',
          isNullable: true,
          default: "'work_orders'",
          comment: 'Default data source for reports (work_orders, assets, inventory, safety, etc.)',
        }),
      );
    }

    // Add default_date_range column
    if (!table.columns.find((col) => col.name === 'default_date_range')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'default_date_range',
          type: 'int',
          isNullable: true,
          default: 30,
          comment: 'Default date range in days for report data',
        }),
      );
    }

    // Add organization_logo_url column for saved org logo reference
    if (!table.columns.find((col) => col.name === 'organization_logo_url')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'organization_logo_url',
          type: 'text',
          isNullable: true,
          comment: 'Organization logo URL for branding in reports',
        }),
      );
    }

    // Add tamoptix_logo_url column
    if (!table.columns.find((col) => col.name === 'tamoptix_logo_url')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'tamoptix_logo_url',
          type: 'text',
          isNullable: true,
          default: "'/tamoptix/tamoptix-logo.svg'",
          comment: 'TamOptiX logo URL for report branding',
        }),
      );
    }

    // Add locale/language column
    if (!table.columns.find((col) => col.name === 'report_locale')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'report_locale',
          type: 'varchar',
          length: '10',
          isNullable: true,
          default: "'en'",
          comment: 'Report locale for internationalization (en, fr, es, de, etc.)',
        }),
      );
    }

    // Add cell_width and cell_height defaults
    if (!table.columns.find((col) => col.name === 'default_cell_width')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'default_cell_width',
          type: 'int',
          isNullable: true,
          default: 120,
          comment: 'Default cell width in pixels',
        }),
      );
    }

    if (!table.columns.find((col) => col.name === 'default_cell_height')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'default_cell_height',
          type: 'int',
          isNullable: true,
          default: 30,
          comment: 'Default cell height in pixels',
        }),
      );
    }

    // Add show_row_striping column
    if (!table.columns.find((col) => col.name === 'show_row_striping')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'show_row_striping',
          type: 'boolean',
          isNullable: true,
          default: true,
          comment: 'Enable alternating row colors in tables',
        }),
      );
    }

    // Add page_orientation column
    if (!table.columns.find((col) => col.name === 'page_orientation')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'page_orientation',
          type: 'varchar',
          length: '20',
          isNullable: true,
          default: "'portrait'",
          comment: 'PDF page orientation (portrait or landscape)',
        }),
      );
    }

    // Add paper_size column
    if (!table.columns.find((col) => col.name === 'paper_size')) {
      await queryRunner.addColumn(
        'report_format_config',
        new TableColumn({
          name: 'paper_size',
          type: 'varchar',
          length: '20',
          isNullable: true,
          default: "'A4'",
          comment: 'PDF paper size (A4, Letter, A3)',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('report_format_config');
    if (!table) return;

    const columnsToDrop = [
      'sheets_config',
      'chart_config',
      'cell_defaults',
      'report_data_source',
      'default_date_range',
      'organization_logo_url',
      'tamoptix_logo_url',
      'report_locale',
      'default_cell_width',
      'default_cell_height',
      'show_row_striping',
      'page_orientation',
      'paper_size',
    ];

    for (const col of columnsToDrop) {
      if (table.columns.find((c) => c.name === col)) {
        await queryRunner.dropColumn('report_format_config', col);
      }
    }
  }
}
