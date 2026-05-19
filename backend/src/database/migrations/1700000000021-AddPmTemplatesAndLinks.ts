import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableColumn, TableForeignKey } from 'typeorm';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE } from '../entities/common';

export class AddPmTemplatesAndLinks1700000000021 implements MigrationInterface {
  name = 'AddPmTemplatesAndLinks1700000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTemplates = await queryRunner.hasTable('pm_templates');
    if (!hasTemplates) {
      await queryRunner.createTable(
        new Table({
          name: 'pm_templates',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'template_name', type: 'varchar' },
            { name: 'maintenance_type', type: 'varchar', default: "'PM'" },
            { name: 'discipline', type: 'varchar', isNullable: true },
            { name: 'frequency_type', type: 'varchar' },
            { name: 'frequency_value', type: 'int', default: 1 },
            { name: 'estimated_duration', type: 'int', default: 60 },
            { name: 'checklist_tasks', type: LARGE_TEXT_COLUMN_TYPE, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['plant_id'],
              referencedTableName: 'plants',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
          ],
        }),
      );
    }

    const hasLinks = await queryRunner.hasTable('pm_template_links');
    if (!hasLinks) {
      await queryRunner.createTable(
        new Table({
          name: 'pm_template_links',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'template_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'department_id', type: 'uuid', isNullable: true },
            { name: 'asset_id', type: 'uuid' },
            { name: 'start_date', type: DATETIME_COLUMN_TYPE },
            { name: 'assigned_team_id', type: 'uuid', isNullable: true },
            { name: 'responsible_user_id', type: 'uuid', isNullable: true },
            { name: 'next_due_date', type: DATETIME_COLUMN_TYPE },
            { name: 'last_generated_at', type: DATETIME_COLUMN_TYPE, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['template_id'],
              referencedTableName: 'pm_templates',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
            new TableForeignKey({
              columnNames: ['plant_id'],
              referencedTableName: 'plants',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
            new TableForeignKey({
              columnNames: ['department_id'],
              referencedTableName: 'departments',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
            new TableForeignKey({
              columnNames: ['asset_id'],
              referencedTableName: 'assets',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
            new TableForeignKey({
              columnNames: ['assigned_team_id'],
              referencedTableName: 'maintenance_teams',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
            new TableForeignKey({
              columnNames: ['responsible_user_id'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
          ],
        }),
      );
    }

    const pmScheduleTable = 'pm_schedules';
    const columns: Array<TableColumn> = [
      new TableColumn({ name: 'template_id', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'template_link_id', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'maintenance_type', type: 'varchar', default: "'PM'" }),
      new TableColumn({ name: 'discipline', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'frequency_type', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'frequency_value', type: 'int', isNullable: true }),
      new TableColumn({ name: 'estimated_duration', type: 'int', isNullable: true }),
      new TableColumn({ name: 'assigned_team_id', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'completed_at', type: DATETIME_COLUMN_TYPE, isNullable: true }),
    ];

    for (const column of columns) {
      if (!(await queryRunner.hasColumn(pmScheduleTable, column.name))) {
        await queryRunner.addColumn(pmScheduleTable, column);
      }
    }

    await this.addForeignKeyIfMissing(queryRunner, pmScheduleTable, 'template_id', 'pm_templates');
    await this.addForeignKeyIfMissing(queryRunner, pmScheduleTable, 'template_link_id', 'pm_template_links');
    await this.addForeignKeyIfMissing(queryRunner, pmScheduleTable, 'assigned_team_id', 'maintenance_teams');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const pmScheduleTable = await queryRunner.getTable('pm_schedules');
    if (pmScheduleTable) {
      for (const keyName of ['template_id', 'template_link_id', 'assigned_team_id']) {
        const fk = pmScheduleTable.foreignKeys.find((item) => item.columnNames.includes(keyName));
        if (fk) await queryRunner.dropForeignKey('pm_schedules', fk);
      }
      for (const columnName of ['template_id', 'template_link_id', 'maintenance_type', 'discipline', 'frequency_type', 'frequency_value', 'estimated_duration', 'assigned_team_id', 'completed_at']) {
        if (await queryRunner.hasColumn('pm_schedules', columnName)) {
          await queryRunner.dropColumn('pm_schedules', columnName);
        }
      }
    }

    if (await queryRunner.hasTable('pm_template_links')) {
      await queryRunner.dropTable('pm_template_links');
    }
    if (await queryRunner.hasTable('pm_templates')) {
      await queryRunner.dropTable('pm_templates');
    }
  }

  private async addForeignKeyIfMissing(queryRunner: QueryRunner, tableName: string, columnName: string, referencedTableName: string) {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;

    // Direct check for existing foreign key in Postgres
    const existingFks = await queryRunner.query(`
      SELECT constraint_name 
      FROM information_schema.key_column_usage 
      WHERE table_name = '${tableName}' AND column_name = '${columnName}'
      AND constraint_name LIKE 'FK_%'
    `);
    if (existingFks && existingFks.length > 0) return;

    await queryRunner.createForeignKey(
      tableName,
      new TableForeignKey({
        columnNames: [columnName],
        referencedTableName,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }
}
