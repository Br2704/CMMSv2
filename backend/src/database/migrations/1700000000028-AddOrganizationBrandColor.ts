import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';

export class AddOrganizationBrandColor1700000000028 implements MigrationInterface {
  name = 'AddOrganizationBrandColor1700000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOrganizations = await queryRunner.hasTable('organizations');
    if (!hasOrganizations) return;

    const hasColumn = await queryRunner.hasColumn('organizations', 'brand_color');
    if (!hasColumn) {
      await queryRunner.addColumn(
        'organizations',
        new TableColumn({
          name: 'brand_color',
          type: 'varchar',
          length: '7',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasOrganizations = await queryRunner.hasTable('organizations');
    if (!hasOrganizations) return;

    const hasColumn = await queryRunner.hasColumn('organizations', 'brand_color');
    if (hasColumn) {
      await queryRunner.dropColumn('organizations', 'brand_color');
    }
  }
}
