import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class GateTemplateUsersAndSecurityMeta1700000000033 implements MigrationInterface {
  name = 'GateTemplateUsersAndSecurityMeta1700000000033';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private async ensureColumn(queryRunner: QueryRunner, tableName: string, column: TableColumn) {
    if (!(await queryRunner.hasTable(tableName))) {
      return;
    }
    if (await queryRunner.hasColumn(tableName, column.name)) {
      return;
    }
    await queryRunner.addColumn(tableName, column);
  }

  private async ensureForeignKey(queryRunner: QueryRunner, tableName: string, foreignKey: TableForeignKey) {
    const table = await queryRunner.getTable(tableName);
    if (!table) {
      return;
    }
    if (table.foreignKeys.some((item) => item.name === foreignKey.name)) {
      return;
    }
    await queryRunner.createForeignKey(tableName, foreignKey);
  }

  private async ensureIndex(queryRunner: QueryRunner, tableName: string, index: TableIndex) {
    const table = await queryRunner.getTable(tableName);
    if (!table) {
      return;
    }
    if (table.indices.some((item) => item.name === index.name)) {
      return;
    }
    await queryRunner.createIndex(tableName, index);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      new TableColumn({ name: 'allowed_roles', type: 'text', isNullable: true }),
      new TableColumn({ name: 'frequency', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'security_level', type: 'varchar', isNullable: true }),
    ]) {
      await this.ensureColumn(queryRunner, 'gate_entry_types', column);
    }

    if (!(await queryRunner.hasTable('gate_template_users'))) {
      await queryRunner.createTable(
        new Table({
          name: 'gate_template_users',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'template_id', type: 'uuid' },
            { name: 'allowed_user_type', type: 'varchar' },
            { name: 'department_id', type: 'uuid', isNullable: true },
            { name: 'approval_required', type: 'boolean', default: false },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.ensureForeignKey(
      queryRunner,
      'gate_template_users',
      new TableForeignKey({
        name: 'fk_gate_template_users_template_id',
        columnNames: ['template_id'],
        referencedTableName: 'gate_entry_types',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await this.ensureForeignKey(
      queryRunner,
      'gate_template_users',
      new TableForeignKey({
        name: 'fk_gate_template_users_department_id',
        columnNames: ['department_id'],
        referencedTableName: 'departments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.ensureIndex(
      queryRunner,
      'gate_template_users',
      new TableIndex({
        name: 'idx_gate_template_users_template',
        columnNames: ['template_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('gate_template_users')) {
      const table = await queryRunner.getTable('gate_template_users');
      for (const fk of table?.foreignKeys ?? []) {
        await queryRunner.dropForeignKey('gate_template_users', fk);
      }
      for (const index of table?.indices ?? []) {
        await queryRunner.dropIndex('gate_template_users', index);
      }
      await queryRunner.dropTable('gate_template_users');
    }

    if (await queryRunner.hasTable('gate_entry_types')) {
      for (const columnName of ['security_level', 'frequency', 'allowed_roles']) {
        if (await queryRunner.hasColumn('gate_entry_types', columnName)) {
          await queryRunner.dropColumn('gate_entry_types', columnName);
        }
      }
    }
  }
}
