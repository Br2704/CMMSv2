import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';

export class AddMissingWorkOrderColumns1700000000047 implements MigrationInterface {
  name = 'AddMissingWorkOrderColumns1700000000047';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('work_orders'))) {
      return;
    }

    const dateTimeType = this.dateTimeType(queryRunner);
    const columns: Array<[string, TableColumn]> = [
      [
        'accepted_at',
        new TableColumn({ name: 'accepted_at', type: dateTimeType, isNullable: true }),
      ],
      [
        'escalation_level',
        new TableColumn({ name: 'escalation_level', type: 'int', isNullable: true }),
      ],
      [
        'sla_due_at',
        new TableColumn({ name: 'sla_due_at', type: dateTimeType, isNullable: true }),
      ],
      [
        'cancelled_at',
        new TableColumn({ name: 'cancelled_at', type: dateTimeType, isNullable: true }),
      ],
      [
        'cancelled_by',
        new TableColumn({ name: 'cancelled_by', type: 'uuid', isNullable: true }),
      ],
      [
        'cancellation_reason',
        new TableColumn({ name: 'cancellation_reason', type: 'text', isNullable: true }),
      ],
    ];

    for (const [name, column] of columns) {
      if (!(await queryRunner.hasColumn('work_orders', name))) {
        await queryRunner.addColumn('work_orders', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('work_orders'))) {
      return;
    }

    for (const name of ['accepted_at', 'escalation_level', 'sla_due_at', 'cancelled_at', 'cancelled_by', 'cancellation_reason']) {
      if (await queryRunner.hasColumn('work_orders', name)) {
        await queryRunner.dropColumn('work_orders', name);
      }
    }
  }
}
