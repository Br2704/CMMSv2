import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn, TableForeignKey } from 'typeorm';

export class AddWorkOrderApprovalWorkflow1700000000035 implements MigrationInterface {
  name = 'AddWorkOrderApprovalWorkflow1700000000035';

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
        'submitted_for_approval_at',
        new TableColumn({
          name: 'submitted_for_approval_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'submitted_for_approval_by',
        new TableColumn({
          name: 'submitted_for_approval_by',
          type: 'uuid',
          isNullable: true,
        }),
      ],
      [
        'approved_by',
        new TableColumn({
          name: 'approved_by',
          type: 'uuid',
          isNullable: true,
        }),
      ],
      [
        'approved_at',
        new TableColumn({
          name: 'approved_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'rejected_by',
        new TableColumn({
          name: 'rejected_by',
          type: 'uuid',
          isNullable: true,
        }),
      ],
      [
        'rejected_at',
        new TableColumn({
          name: 'rejected_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'approval_comments',
        new TableColumn({
          name: 'approval_comments',
          type: 'text',
          isNullable: true,
        }),
      ],
      [
        'admin_override_by',
        new TableColumn({
          name: 'admin_override_by',
          type: 'uuid',
          isNullable: true,
        }),
      ],
      [
        'admin_override_at',
        new TableColumn({
          name: 'admin_override_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'admin_override_reason',
        new TableColumn({
          name: 'admin_override_reason',
          type: 'text',
          isNullable: true,
        }),
      ],
    ];

    for (const [name, column] of columns) {
      if (!(await queryRunner.hasColumn('work_orders', name))) {
        await queryRunner.addColumn('work_orders', column);
      }
    }

    const table = await queryRunner.getTable('work_orders');
    if (!table) {
      return;
    }

    const foreignKeys: Array<[string, string]> = [
      ['submitted_for_approval_by', 'fk_work_orders_submitted_for_approval_by'],
      ['approved_by', 'fk_work_orders_approved_by'],
      ['rejected_by', 'fk_work_orders_rejected_by'],
      ['admin_override_by', 'fk_work_orders_admin_override_by'],
    ];

    for (const [columnName, keyName] of foreignKeys) {
      const existingKey = table.foreignKeys.find((key) => key.name === keyName || key.columnNames.includes(columnName));
      if (existingKey) {
        continue;
      }
      await queryRunner.createForeignKey(
        'work_orders',
        new TableForeignKey({
          name: keyName,
          columnNames: [columnName],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('work_orders'))) {
      return;
    }

    const table = await queryRunner.getTable('work_orders');
    if (table) {
      for (const keyName of [
        'fk_work_orders_submitted_for_approval_by',
        'fk_work_orders_approved_by',
        'fk_work_orders_rejected_by',
        'fk_work_orders_admin_override_by',
      ]) {
        const foreignKey = table.foreignKeys.find((key) => key.name === keyName);
        if (foreignKey) {
          await queryRunner.dropForeignKey('work_orders', foreignKey);
        }
      }
    }

    for (const columnName of [
      'admin_override_reason',
      'admin_override_at',
      'admin_override_by',
      'approval_comments',
      'rejected_at',
      'rejected_by',
      'approved_at',
      'approved_by',
      'submitted_for_approval_by',
      'submitted_for_approval_at',
    ]) {
      if (await queryRunner.hasColumn('work_orders', columnName)) {
        await queryRunner.dropColumn('work_orders', columnName);
      }
    }
  }
}
