import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddNotificationSettingsAndPushSubscriptions1700000000059 implements MigrationInterface {
  name = 'AddNotificationSettingsAndPushSubscriptions1700000000059';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notification_settings table
    const hasNotifSettings = await queryRunner.hasTable('notification_settings');
    if (!hasNotifSettings) {
      await queryRunner.createTable(
        new Table({
          name: 'notification_settings',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
            { name: 'user_id', type: 'uuid', isNullable: false },
            { name: 'email_notifications', type: 'boolean', default: true },
            { name: 'push_notifications', type: 'boolean', default: true },
            { name: 'in_app_notifications', type: 'boolean', default: true },
            { name: 'daily_digest', type: 'boolean', default: false },
            { name: 'new_wo_email', type: 'boolean', default: true },
            { name: 'wo_assigned_email', type: 'boolean', default: true },
            { name: 'wo_escalation_email', type: 'boolean', default: true },
            { name: 'wo_reminder_email', type: 'boolean', default: true },
            { name: 'wo_completed_email', type: 'boolean', default: true },
            { name: 'sla_breach_email', type: 'boolean', default: true },
            { name: 'quiet_hours_start', type: 'varchar', isNullable: true },
            { name: 'quiet_hours_end', type: 'varchar', isNullable: true },
            { name: 'email_digest_frequency', type: 'varchar', default: "'REALTIME'" },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'notification_settings',
        new TableIndex({
          name: 'idx_notif_settings_user',
          columnNames: ['user_id'],
          isUnique: true,
        }),
      );
    }

    // Create push_subscriptions table
    const hasPushSubs = await queryRunner.hasTable('push_subscriptions');
    if (!hasPushSubs) {
      await queryRunner.createTable(
        new Table({
          name: 'push_subscriptions',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
            { name: 'user_id', type: 'uuid', isNullable: false },
            { name: 'endpoint', type: 'text', isNullable: false },
            { name: 'keys', type: 'text', isNullable: false },
            { name: 'user_agent', type: 'varchar', isNullable: true },
            { name: 'last_used_at', type: 'timestamp', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'push_subscriptions',
        new TableIndex({
          name: 'idx_push_subs_user_endpoint',
          columnNames: ['user_id', 'endpoint'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('push_subscriptions', true);
    await queryRunner.dropTable('notification_settings', true);
  }
}
