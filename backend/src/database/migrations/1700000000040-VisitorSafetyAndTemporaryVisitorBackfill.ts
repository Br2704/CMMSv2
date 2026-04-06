import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class VisitorSafetyAndTemporaryVisitorBackfill1700000000040 implements MigrationInterface {
  name = 'VisitorSafetyAndTemporaryVisitorBackfill1700000000040';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private largeTextType(queryRunner: QueryRunner) {
    if (queryRunner.connection.options.type === 'mysql') return 'longtext';
    if (queryRunner.connection.options.type === 'mssql') return 'ntext';
    return 'text';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dateTimeType = this.dateTimeType(queryRunner);
    const largeTextType = this.largeTextType(queryRunner);

    if (await queryRunner.hasTable('visitor_experience_content')) {
      const hasExperienceMeta = await queryRunner.hasColumn('visitor_experience_content', 'experience_meta');
      if (!hasExperienceMeta) {
        await queryRunner.addColumn(
          'visitor_experience_content',
          new TableColumn({
            name: 'experience_meta',
            type: largeTextType,
            isNullable: true,
          }),
        );
      }
    }

    if (!(await queryRunner.hasTable('visitor_safety_log'))) {
      await queryRunner.createTable(
        new Table({
          name: 'visitor_safety_log',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'visitor_id', type: 'uuid' },
            { name: 'gate_entry_id', type: 'uuid', isNullable: true },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'consent_given', type: 'boolean', default: true },
            { name: 'consented_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'ip_address', type: 'varchar', isNullable: true },
            { name: 'device_info', type: largeTextType, isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createForeignKey(
        'visitor_safety_log',
        new TableForeignKey({
          name: 'fk_visitor_safety_log_visitor',
          columnNames: ['visitor_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'visitor_safety_log',
        new TableForeignKey({
          name: 'fk_visitor_safety_log_gate_entry',
          columnNames: ['gate_entry_id'],
          referencedTableName: 'gate_entries',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createForeignKey(
        'visitor_safety_log',
        new TableForeignKey({
          name: 'fk_visitor_safety_log_plant',
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createIndex(
        'visitor_safety_log',
        new TableIndex({
          name: 'idx_visitor_safety_log_visitor_time',
          columnNames: ['visitor_id', 'consented_at'],
        }),
      );

      await queryRunner.createIndex(
        'visitor_safety_log',
        new TableIndex({
          name: 'idx_visitor_safety_log_gate_entry',
          columnNames: ['gate_entry_id'],
        }),
      );

      await queryRunner.createIndex(
        'visitor_safety_log',
        new TableIndex({
          name: 'idx_visitor_safety_log_plant',
          columnNames: ['plant_id'],
        }),
      );
    }

    if (await queryRunner.hasTable('roles')) {
      const roleRows = await queryRunner.query("SELECT id FROM roles WHERE UPPER(name) = 'TEMPORARY_VISITOR'");
      if (!Array.isArray(roleRows) || roleRows.length === 0) {
        await queryRunner.query(
          `INSERT INTO roles (id, name, description, is_system, is_active, created_at, updated_at)
           VALUES ('${randomUUID()}', 'TEMPORARY_VISITOR', 'Temporary visitor role for smart gate sessions', TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
      }
    }

    if (await queryRunner.hasTable('org_roles')) {
      const organizations = await queryRunner.query('SELECT id FROM organizations');
      if (Array.isArray(organizations)) {
        for (const row of organizations as Array<{ id: string }>) {
          const organizationId = row.id;
          if (!organizationId) continue;

          const existing = await queryRunner.query(
            `SELECT id FROM org_roles WHERE organization_id = '${organizationId}' AND UPPER(key) = 'TEMPORARY_VISITOR'`,
          );
          if (Array.isArray(existing) && existing.length > 0) {
            continue;
          }

          await queryRunner.query(
            `INSERT INTO org_roles (id, organization_id, key, name, is_system, is_active, created_at, updated_at)
             VALUES ('${randomUUID()}', '${organizationId}', 'TEMPORARY_VISITOR', 'TEMPORARY_VISITOR', TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('visitor_safety_log')) {
      const table = await queryRunner.getTable('visitor_safety_log');
      if (table) {
        for (const indexName of ['idx_visitor_safety_log_visitor_time', 'idx_visitor_safety_log_gate_entry', 'idx_visitor_safety_log_plant']) {
          const index = table.indices.find((candidate) => candidate.name === indexName);
          if (index) {
            await queryRunner.dropIndex('visitor_safety_log', index);
          }
        }

        for (const keyName of ['fk_visitor_safety_log_visitor', 'fk_visitor_safety_log_gate_entry', 'fk_visitor_safety_log_plant']) {
          const foreignKey = table.foreignKeys.find((candidate) => candidate.name === keyName);
          if (foreignKey) {
            await queryRunner.dropForeignKey('visitor_safety_log', foreignKey);
          }
        }
      }

      await queryRunner.dropTable('visitor_safety_log');
    }

    if (await queryRunner.hasTable('visitor_experience_content')) {
      const hasExperienceMeta = await queryRunner.hasColumn('visitor_experience_content', 'experience_meta');
      if (hasExperienceMeta) {
        await queryRunner.dropColumn('visitor_experience_content', 'experience_meta');
      }
    }
  }
}
