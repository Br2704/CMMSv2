import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMailTables1700000000052 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('mail_queue'))) {
      await queryRunner.createTable(
        new Table({
          name: 'mail_queue',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
            { name: 'recipient', type: 'varchar' },
            { name: 'cc', type: 'varchar', isNullable: true },
            { name: 'bcc', type: 'varchar', isNullable: true },
            { name: 'subject', type: 'varchar' },
            { name: 'html_body', type: 'text' },
            { name: 'text_body', type: 'text', isNullable: true },
            { name: 'status', type: 'varchar', default: "'PENDING'" },
            { name: 'priority', type: 'int', default: 0 },
            { name: 'retry_count', type: 'int', default: 0 },
            { name: 'max_retries', type: 'int', default: 3 },
            { name: 'last_error', type: 'text', isNullable: true },
            { name: 'next_retry_at', type: 'timestamp', isNullable: true },
            { name: 'processed_at', type: 'timestamp', isNullable: true },
            { name: 'template_name', type: 'varchar', isNullable: true },
            { name: 'template_data', type: 'jsonb', isNullable: true },
            { name: 'wo_id', type: 'uuid', isNullable: true },
            { name: 'wo_number', type: 'varchar', isNullable: true },
            { name: 'event_type', type: 'varchar', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'mail_queue',
        new TableIndex({ name: 'idx_mail_queue_status', columnNames: ['status'] }),
      );
      await queryRunner.createIndex(
        'mail_queue',
        new TableIndex({ name: 'idx_mail_queue_priority', columnNames: ['priority', 'created_at'] }),
      );
    }

    if (!(await queryRunner.hasTable('email_logs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'email_logs',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
            { name: 'user_id', type: 'uuid', isNullable: true },
            { name: 'recipient', type: 'varchar' },
            { name: 'subject', type: 'varchar' },
            { name: 'body', type: 'text' },
            { name: 'status', type: 'varchar', default: "'QUEUED'" },
            { name: 'template_name', type: 'varchar', isNullable: true },
            { name: 'wo_id', type: 'uuid', isNullable: true },
            { name: 'wo_number', type: 'varchar', isNullable: true },
            { name: 'event_type', type: 'varchar', isNullable: true },
            { name: 'retry_count', type: 'int', default: 0 },
            { name: 'max_retries', type: 'int', default: 3 },
            { name: 'sent_at', type: 'timestamp', isNullable: true },
            { name: 'opened_at', type: 'timestamp', isNullable: true },
            { name: 'delivery_error', type: 'text', isNullable: true },
            { name: 'message_id', type: 'varchar', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'email_logs',
        new TableIndex({ name: 'idx_email_logs_user', columnNames: ['user_id'] }),
      );
      await queryRunner.createIndex(
        'email_logs',
        new TableIndex({ name: 'idx_email_logs_status', columnNames: ['status'] }),
      );
      await queryRunner.createIndex(
        'email_logs',
        new TableIndex({ name: 'idx_email_logs_wo', columnNames: ['wo_id'] }),
      );
      await queryRunner.createIndex(
        'email_logs',
        new TableIndex({ name: 'idx_email_logs_created', columnNames: ['created_at'] }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('email_logs', true);
    await queryRunner.dropTable('mail_queue', true);
  }
}
