import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class RbacVersioning1700000000007 implements MigrationInterface {
  name = 'RbacVersioning1700000000007';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('roles', 'is_active'))) {
      await queryRunner.query('ALTER TABLE roles ADD COLUMN is_active boolean NOT NULL DEFAULT true');
    }
    await queryRunner.query('UPDATE roles SET is_active = true WHERE is_active IS NULL');

    if (!(await queryRunner.hasTable('rbac_meta'))) {
      await queryRunner.createTable(
        new Table({
          name: 'rbac_meta',
          columns: [
            { name: 'id', type: 'int', isPrimary: true },
            { name: 'version', type: 'int', default: 1 },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    const existing = await queryRunner.query('SELECT id FROM rbac_meta WHERE id = 1');
    if (!Array.isArray(existing) || existing.length === 0) {
      await queryRunner.query('INSERT INTO rbac_meta (id, version, updated_at) VALUES (1, 1, CURRENT_TIMESTAMP)');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('rbac_meta')) {
      await queryRunner.dropTable('rbac_meta');
    }
    if (await queryRunner.hasColumn('roles', 'is_active')) {
      await queryRunner.query('ALTER TABLE roles DROP COLUMN is_active');
    }
  }
}
