import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddNotificationGrouping1700000000044 implements MigrationInterface {
  name = 'AddNotificationGrouping1700000000044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) {
      return;
    }

    if (!(await queryRunner.hasColumn('notifications', 'category'))) {
      await queryRunner.addColumn(
        'notifications',
        new TableColumn({
          name: 'category',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('notifications', 'group_key'))) {
      await queryRunner.addColumn(
        'notifications',
        new TableColumn({
          name: 'group_key',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }

    const table = await queryRunner.getTable('notifications');
    if (!table) return;

    const hasIndex = table.indices.some((index) => index.name === 'idx_notifications_group');
    if (!hasIndex) {
      await queryRunner.createIndex(
        'notifications',
        new TableIndex({
          name: 'idx_notifications_group',
          columnNames: ['user_id', 'group_key', 'created_at'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) {
      return;
    }

    const table = await queryRunner.getTable('notifications');
    if (table) {
      const index = table.indices.find((candidate) => candidate.name === 'idx_notifications_group');
      if (index) {
        await queryRunner.dropIndex('notifications', index);
      }
    }

    if (await queryRunner.hasColumn('notifications', 'group_key')) {
      await queryRunner.dropColumn('notifications', 'group_key');
    }

    if (await queryRunner.hasColumn('notifications', 'category')) {
      await queryRunner.dropColumn('notifications', 'category');
    }
  }
}
