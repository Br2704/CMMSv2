import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddMachineScopedFieldsToSpareItems1700000000019 implements MigrationInterface {
  name = 'AddMachineScopedFieldsToSpareItems1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('spare_items', 'asset_id'))) {
      await queryRunner.addColumn(
        'spare_items',
        new TableColumn({
          name: 'asset_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('spare_items', 'is_critical'))) {
      await queryRunner.addColumn(
        'spare_items',
        new TableColumn({
          name: 'is_critical',
          type: 'boolean',
          default: false,
        }),
      );
    }

    const table = await queryRunner.getTable('spare_items');
    const hasForeignKey = table?.foreignKeys.some((foreignKey) => foreignKey.columnNames.includes('asset_id'));
    if (!hasForeignKey) {
      await queryRunner.createForeignKey(
        'spare_items',
        new TableForeignKey({
          columnNames: ['asset_id'],
          referencedTableName: 'assets',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('spare_items');
    const assetForeignKey = table?.foreignKeys.find((foreignKey) => foreignKey.columnNames.includes('asset_id'));
    if (assetForeignKey) {
      await queryRunner.dropForeignKey('spare_items', assetForeignKey);
    }

    if (await queryRunner.hasColumn('spare_items', 'is_critical')) {
      await queryRunner.dropColumn('spare_items', 'is_critical');
    }

    if (await queryRunner.hasColumn('spare_items', 'asset_id')) {
      await queryRunner.dropColumn('spare_items', 'asset_id');
    }
  }
}
