import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';
import { LARGE_TEXT_COLUMN_TYPE } from '../entities/common';

export class AddPmTemplateLinkChecklistOverride1700000000038 implements MigrationInterface {
  name = 'AddPmTemplateLinkChecklistOverride1700000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'pm_template_links';
    if (!(await queryRunner.hasTable(tableName))) {
      return;
    }

    if (!(await queryRunner.hasColumn(tableName, 'checklist_tasks_override'))) {
      await queryRunner.addColumn(
        tableName,
        new TableColumn({
          name: 'checklist_tasks_override',
          type: LARGE_TEXT_COLUMN_TYPE,
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'pm_template_links';
    if (!(await queryRunner.hasTable(tableName))) {
      return;
    }

    if (await queryRunner.hasColumn(tableName, 'checklist_tasks_override')) {
      await queryRunner.dropColumn(tableName, 'checklist_tasks_override');
    }
  }
}
