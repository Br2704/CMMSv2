import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';

export class ExpandOrganizationBrandingColumns1700000000016 implements MigrationInterface {
  name = 'ExpandOrganizationBrandingColumns1700000000016';

  private getLargeTextType(queryRunner: QueryRunner) {
    const dbType = queryRunner.connection.options.type;
    if (dbType === 'mysql') return 'longtext';
    if (dbType === 'mssql') return 'ntext';
    return 'text';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOrganizations = await queryRunner.hasTable('organizations');
    if (!hasOrganizations) return;

    const largeTextType = this.getLargeTextType(queryRunner);
    const table = await queryRunner.getTable('organizations');
    if (!table) return;

    const logoColumn = table.columns.find((column) => column.name === 'logo_url');
    if (logoColumn && logoColumn.type !== largeTextType) {
      await queryRunner.changeColumn(
        'organizations',
        logoColumn,
        new TableColumn({
          name: 'logo_url',
          type: largeTextType,
          isNullable: true,
        }),
      );
    }

    const faviconColumn = table.columns.find((column) => column.name === 'favicon_url');
    if (faviconColumn && faviconColumn.type !== largeTextType) {
      await queryRunner.changeColumn(
        'organizations',
        faviconColumn,
        new TableColumn({
          name: 'favicon_url',
          type: largeTextType,
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasOrganizations = await queryRunner.hasTable('organizations');
    if (!hasOrganizations) return;

    const table = await queryRunner.getTable('organizations');
    if (!table) return;

    const logoColumn = table.columns.find((column) => column.name === 'logo_url');
    if (logoColumn && logoColumn.type !== 'text') {
      await queryRunner.changeColumn(
        'organizations',
        logoColumn,
        new TableColumn({
          name: 'logo_url',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    const faviconColumn = table.columns.find((column) => column.name === 'favicon_url');
    if (faviconColumn && faviconColumn.type !== 'text') {
      await queryRunner.changeColumn(
        'organizations',
        faviconColumn,
        new TableColumn({
          name: 'favicon_url',
          type: 'text',
          isNullable: true,
        }),
      );
    }
  }
}
