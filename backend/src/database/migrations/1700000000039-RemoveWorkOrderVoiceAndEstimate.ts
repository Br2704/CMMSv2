import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';

export class RemoveWorkOrderVoiceAndEstimate1700000000039 implements MigrationInterface {
  name = 'RemoveWorkOrderVoiceAndEstimate1700000000039';

  private getJsonType(queryRunner: QueryRunner) {
    const dbType = queryRunner.connection.options.type;
    if (dbType === 'postgres') return 'jsonb';
    if (dbType === 'mysql') return 'json';
    return 'text';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('work_orders')) {
      if (await queryRunner.hasColumn('work_orders', 'voice_notes')) {
        await queryRunner.dropColumn('work_orders', 'voice_notes');
      }
      if (await queryRunner.hasColumn('work_orders', 'estimated_cost')) {
        await queryRunner.dropColumn('work_orders', 'estimated_cost');
      }
    }

    if (await queryRunner.hasTable('work_order_activity_logs')) {
      if (await queryRunner.hasColumn('work_order_activity_logs', 'voice_notes')) {
        await queryRunner.dropColumn('work_order_activity_logs', 'voice_notes');
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('work_orders')) {
      if (!(await queryRunner.hasColumn('work_orders', 'estimated_cost'))) {
        await queryRunner.addColumn(
          'work_orders',
          new TableColumn({
            name: 'estimated_cost',
            type: 'decimal',
            precision: 12,
            scale: 2,
            default: 0,
          }),
        );
      }

      if (!(await queryRunner.hasColumn('work_orders', 'voice_notes'))) {
        await queryRunner.addColumn(
          'work_orders',
          new TableColumn({
            name: 'voice_notes',
            type: this.getJsonType(queryRunner),
            isNullable: true,
          }),
        );
      }
    }

    if (await queryRunner.hasTable('work_order_activity_logs')) {
      if (!(await queryRunner.hasColumn('work_order_activity_logs', 'voice_notes'))) {
        await queryRunner.addColumn(
          'work_order_activity_logs',
          new TableColumn({
            name: 'voice_notes',
            type: this.getJsonType(queryRunner),
            isNullable: true,
          }),
        );
      }
    }
  }
}
