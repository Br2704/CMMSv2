import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSpareConsumptionToWorkOrders1700000000020 implements MigrationInterface {
  name = 'AddSpareConsumptionToWorkOrders1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('work_orders', 'spare_consumption'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'spare_consumption',
          type: 'text',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('work_orders', 'spare_consumption')) {
      await queryRunner.dropColumn('work_orders', 'spare_consumption');
    }
  }
}
