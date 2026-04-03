import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableColumn, TableIndex, TableForeignKey } from 'typeorm';

export class AddWorkOrderMobileExecution1700000000029 implements MigrationInterface {
  name = 'AddWorkOrderMobileExecution1700000000029';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private getJsonType(queryRunner: QueryRunner) {
    const dbType = queryRunner.connection.options.type;
    if (dbType === 'postgres') return 'jsonb';
    if (dbType === 'mysql') return 'json';
    return 'text';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dateTimeType = this.dateTimeType(queryRunner);
    const hasWorkOrders = await queryRunner.hasTable('work_orders');
    if (hasWorkOrders) {
      const jsonType = this.getJsonType(queryRunner);
      const extraColumns = [
        ['attachments', jsonType],
        ['voice_notes', jsonType],
        ['safety_checklist', jsonType],
        ['technician_verification', jsonType],
      ] as const;

      for (const [name, type] of extraColumns) {
        const hasColumn = await queryRunner.hasColumn('work_orders', name);
        if (!hasColumn) {
          await queryRunner.addColumn(
            'work_orders',
            new TableColumn({
              name,
              type,
              isNullable: true,
            }),
          );
        }
      }
    }

    const hasActivityTable = await queryRunner.hasTable('work_order_activity_logs');
    if (!hasActivityTable) {
      const jsonType = this.getJsonType(queryRunner);
      await queryRunner.createTable(
        new Table({
          name: 'work_order_activity_logs',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true },
            { name: 'work_order_id', type: 'uuid' },
            { name: 'asset_id', type: 'uuid', isNullable: true },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'actor_user_id', type: 'uuid', isNullable: true },
            { name: 'event_type', type: 'varchar' },
            { name: 'notes', type: 'text', isNullable: true },
            { name: 'safety_checklist', type: jsonType, isNullable: true },
            { name: 'attachments', type: jsonType, isNullable: true },
            { name: 'voice_notes', type: jsonType, isNullable: true },
            { name: 'event_meta', type: jsonType, isNullable: true },
            { name: 'occurred_at', type: dateTimeType, isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createForeignKeys('work_order_activity_logs', [
        new TableForeignKey({ columnNames: ['work_order_id'], referencedTableName: 'work_orders', referencedColumnNames: ['id'], onDelete: 'CASCADE' }),
        new TableForeignKey({ columnNames: ['asset_id'], referencedTableName: 'assets', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
        new TableForeignKey({ columnNames: ['plant_id'], referencedTableName: 'plants', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
        new TableForeignKey({ columnNames: ['actor_user_id'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
      ]);
      await queryRunner.createIndex(
        'work_order_activity_logs',
        new TableIndex({
          name: 'idx_wo_activity_work_order',
          columnNames: ['work_order_id', 'created_at'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasActivityTable = await queryRunner.hasTable('work_order_activity_logs');
    if (hasActivityTable) {
      await queryRunner.dropTable('work_order_activity_logs');
    }

    const hasWorkOrders = await queryRunner.hasTable('work_orders');
    if (hasWorkOrders) {
      for (const name of ['attachments', 'voice_notes', 'safety_checklist', 'technician_verification']) {
        const hasColumn = await queryRunner.hasColumn('work_orders', name);
        if (hasColumn) {
          await queryRunner.dropColumn('work_orders', name);
        }
      }
    }
  }
}
