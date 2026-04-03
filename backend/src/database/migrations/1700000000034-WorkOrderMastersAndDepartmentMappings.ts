import { randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableUnique } from 'typeorm';
import { DEFAULT_WORK_ORDER_MASTER_OPTIONS } from '../../modules/workOrderMasters/work-order-master.defaults';

export class WorkOrderMastersAndDepartmentMappings1700000000034 implements MigrationInterface {
  name = 'WorkOrderMastersAndDepartmentMappings1700000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('work_order_masters'))) {
      await queryRunner.createTable(
        new Table({
          name: 'work_order_masters',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true },
            { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'option_type', type: 'varchar' },
            { name: 'code', type: 'varchar' },
            { name: 'label', type: 'varchar' },
            { name: 'description', type: 'text', isNullable: true },
            { name: 'sort_order', type: 'int', default: 0 },
            { name: 'is_active', type: 'boolean', default: true },
          ],
        }),
      );
      await queryRunner.createUniqueConstraint(
        'work_order_masters',
        new TableUnique({
          name: 'uq_work_order_masters_plant_type_code',
          columnNames: ['plant_id', 'option_type', 'code'],
        }),
      );
      await queryRunner.createForeignKey(
        'work_order_masters',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const mappingsTable = await queryRunner.getTable('work_order_team_mappings');
    if (mappingsTable && !mappingsTable.findColumnByName('department_id')) {
      await queryRunner.addColumn(
        'work_order_team_mappings',
        new TableColumn({
          name: 'department_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    const refreshedMappingsTable = await queryRunner.getTable('work_order_team_mappings');
    if (refreshedMappingsTable) {
      const oldUnique = refreshedMappingsTable.uniques.find((item) => item.name === 'uq_work_order_team_mapping_plant_category');
      if (oldUnique) {
        await queryRunner.dropUniqueConstraint('work_order_team_mappings', oldUnique);
      }

      const newUnique = refreshedMappingsTable.uniques.find(
        (item) => item.name === 'uq_work_order_team_mapping_plant_department_category',
      );
      if (!newUnique) {
        await queryRunner.createUniqueConstraint(
          'work_order_team_mappings',
          new TableUnique({
            name: 'uq_work_order_team_mapping_plant_department_category',
            columnNames: ['plant_id', 'department_id', 'category'],
          }),
        );
      }

      const departmentForeignKey = refreshedMappingsTable.foreignKeys.find((item) =>
        item.columnNames.length === 1 && item.columnNames[0] === 'department_id',
      );
      if (!departmentForeignKey) {
        await queryRunner.createForeignKey(
          'work_order_team_mappings',
          new TableForeignKey({
            columnNames: ['department_id'],
            referencedTableName: 'departments',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        );
      }
    }

    const plants = await queryRunner.query('SELECT id FROM plants');
    const rows = plants.flatMap((plant: { id: string }) =>
      DEFAULT_WORK_ORDER_MASTER_OPTIONS.map((item) => ({
        id: randomUUID(),
        plant_id: plant.id,
        option_type: item.optionType,
        code: item.code,
        label: item.label,
        description: item.description ?? null,
        sort_order: item.sortOrder,
        is_active: true,
      })),
    );

    if (rows.length > 0) {
      const placeholders = rows.map((_: (typeof rows)[number], index: number) => {
        const offset = index * 8;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
      });
      const parameters = rows.flatMap((row: (typeof rows)[number]) => [
        row.id,
        row.plant_id,
        row.option_type,
        row.code,
        row.label,
        row.description,
        row.sort_order,
        row.is_active,
      ]);

      await queryRunner.query(
        `
          INSERT INTO "work_order_masters" ("id", "plant_id", "option_type", "code", "label", "description", "sort_order", "is_active")
          VALUES ${placeholders.join(', ')}
          ON CONFLICT ("plant_id", "option_type", "code") DO NOTHING
        `,
        parameters,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const mappingsTable = await queryRunner.getTable('work_order_team_mappings');
    if (mappingsTable) {
      const departmentForeignKey = mappingsTable.foreignKeys.find((item) =>
        item.columnNames.length === 1 && item.columnNames[0] === 'department_id',
      );
      if (departmentForeignKey) {
        await queryRunner.dropForeignKey('work_order_team_mappings', departmentForeignKey);
      }

      const newUnique = mappingsTable.uniques.find(
        (item) => item.name === 'uq_work_order_team_mapping_plant_department_category',
      );
      if (newUnique) {
        await queryRunner.dropUniqueConstraint('work_order_team_mappings', newUnique);
      }

      if (mappingsTable.findColumnByName('department_id')) {
        await queryRunner.dropColumn('work_order_team_mappings', 'department_id');
      }

      const restoredTable = await queryRunner.getTable('work_order_team_mappings');
      const oldUnique = restoredTable?.uniques.find((item) => item.name === 'uq_work_order_team_mapping_plant_category');
      if (!oldUnique) {
        await queryRunner.createUniqueConstraint(
          'work_order_team_mappings',
          new TableUnique({
            name: 'uq_work_order_team_mapping_plant_category',
            columnNames: ['plant_id', 'category'],
          }),
        );
      }
    }

    if (await queryRunner.hasTable('work_order_masters')) {
      await queryRunner.dropTable('work_order_masters');
    }
  }
}
