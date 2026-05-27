import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateReportFormatConfig1700000000054 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('report_format_config');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'report_format_config',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
            },
            {
              name: 'headerTitle',
              type: 'varchar',
              length: '500',
              default: "'OptiX Maintenance Pro'",
            },
            {
              name: 'headerSubtitle',
              type: 'varchar',
              length: '200',
              default: "''",
            },
            {
              name: 'footerText',
              type: 'varchar',
              length: '200',
              default: "'Powered by TamOptiX Technologies'",
            },
            {
              name: 'footerSubtext',
              type: 'varchar',
              length: '500',
              default: "'OptiX Maintenance Pro | Intelligent CMMS Platform'",
            },
            {
              name: 'showTamOptixBranding',
              type: 'boolean',
              default: true,
            },
            {
              name: 'showOrganizationLogo',
              type: 'boolean',
              default: true,
            },
            {
              name: 'showGeneratedDate',
              type: 'boolean',
              default: true,
            },
            {
              name: 'logoAlignment',
              type: 'varchar',
              length: '50',
              default: "'left'",
            },
            {
              name: 'headerColor',
              type: 'varchar',
              length: '50',
              default: "'#000000'",
            },
            {
              name: 'footerColor',
              type: 'varchar',
              length: '50',
              default: "'#6B7280'",
            },
            {
              name: 'headerFontSize',
              type: 'int',
              default: 14,
            },
            {
              name: 'footerFontSize',
              type: 'int',
              default: 8,
            },
            {
              name: 'primaryColor',
              type: 'varchar',
              length: '50',
              default: "'#111827'",
            },
            {
              name: 'headerBgColor',
              type: 'varchar',
              length: '50',
              default: "'#000000'",
            },
            {
              name: 'headerBold',
              type: 'boolean',
              default: true,
            },
            {
              name: 'footerBold',
              type: 'boolean',
              default: true,
            },
            {
              name: 'headerUnderline',
              type: 'boolean',
              default: true,
            },
            {
              name: 'headerAlignment',
              type: 'varchar',
              length: '50',
              default: "'left'",
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
        true,
      );

      // Insert default config row with id = 1
      await queryRunner.query(`
        INSERT INTO "report_format_config" ("id")
        VALUES (1)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('report_format_config', true);
  }
}
