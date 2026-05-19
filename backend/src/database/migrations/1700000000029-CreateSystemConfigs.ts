import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSystemConfigs1700000000029 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('system_configs');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'system_configs',
          columns: [
            {
              name: 'config_key',
              type: 'varchar',
              length: '100',
              isPrimary: true,
            },
            {
              name: 'config_value',
              type: 'jsonb',
              isNullable: true,
            },
            {
              name: 'description',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'is_active',
              type: 'boolean',
              default: true,
            },
            {
              name: 'last_modified_at',
              type: 'timestamp',
              isNullable: true,
            },
            {
              name: 'last_modified_by',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'now()',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
        true,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('system_configs', true);
  }
}
