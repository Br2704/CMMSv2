import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';

export class AddOrganizationFavicon1700000000015 implements MigrationInterface {
  name = 'AddOrganizationFavicon1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOrganizations = await queryRunner.hasTable('organizations');
    if (!hasOrganizations) return;

    const hasColumn = await queryRunner.hasColumn('organizations', 'favicon_url');
    if (!hasColumn) {
      await queryRunner.addColumn(
        'organizations',
        new TableColumn({
          name: 'favicon_url',
          type: 'text',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasOrganizations = await queryRunner.hasTable('organizations');
    if (!hasOrganizations) return;

    const hasColumn = await queryRunner.hasColumn('organizations', 'favicon_url');
    if (hasColumn) {
      await queryRunner.dropColumn('organizations', 'favicon_url');
    }
  }
}
