import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class OperationalLogTemplateScope1700000000030 implements MigrationInterface {
  name = 'OperationalLogTemplateScope1700000000030';

  private async addNullableUuidColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    foreignTable: string,
  ) {
    if (!(await queryRunner.hasTable(tableName))) {
      return;
    }
    if (!(await queryRunner.hasColumn(tableName, columnName))) {
      await queryRunner.addColumn(
        tableName,
        new TableColumn({
          name: columnName,
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    const table = await queryRunner.getTable(tableName);
    if (!table) {
      return;
    }

    const fkName = `fk_${tableName}_${columnName}`;
    if (!table.foreignKeys.some((item) => item.name === fkName)) {
      await queryRunner.createForeignKey(
        tableName,
        new TableForeignKey({
          name: fkName,
          columnNames: [columnName],
          referencedTableName: foreignTable,
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }
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
    const hasLegacyAssignments = await queryRunner.hasTable('log_template_assignments');
    const hasScopedAssignments = await queryRunner.hasTable('log_template_users');
    if (hasLegacyAssignments && !hasScopedAssignments) {
      await queryRunner.renameTable('log_template_assignments', 'log_template_users');
    }

    await this.addNullableUuidColumn(queryRunner, 'log_templates', 'department_id', 'departments');
    await this.addNullableUuidColumn(queryRunner, 'log_templates', 'module_id', 'machine_modules');
    await this.addNullableUuidColumn(queryRunner, 'log_templates', 'machine_id', 'assets');
    await this.addNullableUuidColumn(queryRunner, 'log_entries', 'department_id', 'departments');
    await this.addNullableUuidColumn(queryRunner, 'log_entries', 'module_id', 'machine_modules');
    await this.addNullableUuidColumn(queryRunner, 'log_entries', 'machine_id', 'assets');

    await this.ensureIndex(
      queryRunner,
      'log_templates',
      new TableIndex({
        name: 'idx_log_templates_scope',
        columnNames: ['plant_id', 'department_id', 'module_id', 'machine_id'],
      }),
    );
    await this.ensureIndex(
      queryRunner,
      'log_entries',
      new TableIndex({
        name: 'idx_log_entries_template_user_date',
        columnNames: ['template_id', 'logged_by', 'log_date'],
      }),
    );
    await this.ensureIndex(
      queryRunner,
      'log_template_users',
      new TableIndex({
        name: 'idx_log_template_users_user_template',
        columnNames: ['user_id', 'template_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('log_template_users')) {
      const usersTable = await queryRunner.getTable('log_template_users');
      const userIndex = usersTable?.indices.find((item) => item.name === 'idx_log_template_users_user_template');
      if (userIndex) {
        await queryRunner.dropIndex('log_template_users', userIndex);
      }
    }

    if (await queryRunner.hasTable('log_entries')) {
      const entriesTable = await queryRunner.getTable('log_entries');
      const entriesIndex = entriesTable?.indices.find((item) => item.name === 'idx_log_entries_template_user_date');
      if (entriesIndex) {
        await queryRunner.dropIndex('log_entries', entriesIndex);
      }
      for (const columnName of ['machine_id', 'module_id', 'department_id']) {
        const table = await queryRunner.getTable('log_entries');
        const foreignKey = table?.foreignKeys.find((item) => item.name === `fk_log_entries_${columnName}`);
        if (foreignKey) {
          await queryRunner.dropForeignKey('log_entries', foreignKey);
        }
        if (await queryRunner.hasColumn('log_entries', columnName)) {
          await queryRunner.dropColumn('log_entries', columnName);
        }
      }
    }

    if (await queryRunner.hasTable('log_templates')) {
      const templatesTable = await queryRunner.getTable('log_templates');
      const templatesIndex = templatesTable?.indices.find((item) => item.name === 'idx_log_templates_scope');
      if (templatesIndex) {
        await queryRunner.dropIndex('log_templates', templatesIndex);
      }
      for (const columnName of ['machine_id', 'module_id', 'department_id']) {
        const table = await queryRunner.getTable('log_templates');
        const foreignKey = table?.foreignKeys.find((item) => item.name === `fk_log_templates_${columnName}`);
        if (foreignKey) {
          await queryRunner.dropForeignKey('log_templates', foreignKey);
        }
        if (await queryRunner.hasColumn('log_templates', columnName)) {
          await queryRunner.dropColumn('log_templates', columnName);
        }
      }
    }

    const hasScopedAssignments = await queryRunner.hasTable('log_template_users');
    const hasLegacyAssignments = await queryRunner.hasTable('log_template_assignments');
    if (hasScopedAssignments && !hasLegacyAssignments) {
      await queryRunner.renameTable('log_template_users', 'log_template_assignments');
    }
  }
}
