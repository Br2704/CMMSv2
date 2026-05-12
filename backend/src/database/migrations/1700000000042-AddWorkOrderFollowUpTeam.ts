import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddWorkOrderFollowUpTeam1700000000042 implements MigrationInterface {
  name = 'AddWorkOrderFollowUpTeam1700000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('work_orders'))) {
      return;
    }

    const dateTimeType = queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';

    const extraColumns: Array<[string, TableColumn]> = [
      [
        'accepted_at',
        new TableColumn({
          name: 'accepted_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'escalation_level',
        new TableColumn({
          name: 'escalation_level',
          type: 'int',
          isNullable: true,
        }),
      ],
      [
        'sla_due_at',
        new TableColumn({
          name: 'sla_due_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
    ];

    for (const [name, column] of extraColumns) {
      if (!(await queryRunner.hasColumn('work_orders', name))) {
        await queryRunner.addColumn('work_orders', column);
      }
    }

    if (!(await queryRunner.hasColumn('work_orders', 'follow_up_team_id'))) {
      await queryRunner.addColumn(
        'work_orders',
        new TableColumn({
          name: 'follow_up_team_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    const table = await queryRunner.getTable('work_orders');
    if (!table) {
      return;
    }

    const hasFollowUpTeamFk = table.foreignKeys.some((item) => item.name === 'fk_work_orders_follow_up_team');
    if (!hasFollowUpTeamFk) {
      await queryRunner.createForeignKey(
        'work_orders',
        new TableForeignKey({
          name: 'fk_work_orders_follow_up_team',
          columnNames: ['follow_up_team_id'],
          referencedTableName: 'maintenance_teams',
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
      const foreignKey = table.foreignKeys.find((item) => item.name === 'fk_work_orders_follow_up_team');
      if (foreignKey) {
        await queryRunner.dropForeignKey('work_orders', foreignKey);
      }
    }

    for (const columnName of ['sla_due_at', 'escalation_level', 'accepted_at', 'follow_up_team_id']) {
      if (await queryRunner.hasColumn('work_orders', columnName)) {
        await queryRunner.dropColumn('work_orders', columnName);
      }
    }
  }
}
