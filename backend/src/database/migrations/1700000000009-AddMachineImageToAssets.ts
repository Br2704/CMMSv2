import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMachineImageToAssets1700000000009 implements MigrationInterface {
  name = 'AddMachineImageToAssets1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('assets', 'machine_image_url'))) {
      await queryRunner.addColumn(
        'assets',
        new TableColumn({
          name: 'machine_image_url',
          type: queryRunner.connection.options.type === 'mssql' ? 'ntext' : 'text',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('assets', 'machine_image_url')) {
      await queryRunner.dropColumn('assets', 'machine_image_url');
    }
  }
}
