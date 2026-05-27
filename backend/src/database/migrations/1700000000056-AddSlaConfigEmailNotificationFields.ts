import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSlaConfigEmailNotificationFields1700000000056 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sla_config');
    if (!table) return;

    if (!table.columns.find((col) => col.name === 'notification_email')) {
      await queryRunner.addColumn(
        'sla_config',
        new TableColumn({
          name: 'notification_email',
          type: 'varchar',
          isNullable: true,
          comment: 'Email address to receive SLA alerts/notifications',
        }),
      );
    }

    if (!table.columns.find((col) => col.name === 'send_email_on')) {
      await queryRunner.addColumn(
        'sla_config',
        new TableColumn({
          name: 'send_email_on',
          type: 'text',
          isNullable: true,
          default: "''",
          comment: 'Comma-separated events to send emails on (e.g. ESCALATION,REMINDER,OVERDUE)',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sla_config');
    if (!table) return;

    const columnsToDrop = ['notification_email', 'send_email_on'];
    for (const col of columnsToDrop) {
      if (table.columns.find((c) => c.name === col)) {
        await queryRunner.dropColumn('sla_config', col);
      }
    }
  }
}
