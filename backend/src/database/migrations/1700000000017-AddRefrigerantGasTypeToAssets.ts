import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRefrigerantGasTypeToAssets1700000000017 implements MigrationInterface {
  name = 'AddRefrigerantGasTypeToAssets1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('assets', 'refrigerant_gas_type'))) {
      await queryRunner.addColumn(
        'assets',
        new TableColumn({
          name: 'refrigerant_gas_type',
          type: 'varchar',
          length: '100',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('assets', 'refrigerant_gas_type')) {
      await queryRunner.dropColumn('assets', 'refrigerant_gas_type');
    }
  }
}
