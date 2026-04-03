import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddMachineModules1700000000002 implements MigrationInterface {
  name = 'AddMachineModules1700000000002';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const machineModulesExists = await queryRunner.hasTable('machine_modules');
    if (!machineModulesExists) {
      await queryRunner.createTable(
        new Table({
          name: 'machine_modules',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'uuid',
            },
            { name: 'code', type: 'varchar', isNullable: true },
            { name: 'name', type: 'varchar' },
            { name: 'description', type: 'text', isNullable: true },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'department_id', type: 'uuid', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
        true,
      );

      await queryRunner.createForeignKey(
        'machine_modules',
        new TableForeignKey({
          name: 'fk_machine_modules_plant',
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
      await queryRunner.createForeignKey(
        'machine_modules',
        new TableForeignKey({
          name: 'fk_machine_modules_department',
          columnNames: ['department_id'],
          referencedTableName: 'departments',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createIndex(
        'machine_modules',
        new TableIndex({ name: 'idx_machine_modules_plant', columnNames: ['plant_id'] }),
      );
      await queryRunner.createIndex(
        'machine_modules',
        new TableIndex({ name: 'idx_machine_modules_department', columnNames: ['department_id'] }),
      );
      await queryRunner.createIndex(
        'machine_modules',
        new TableIndex({
          name: 'idx_machine_modules_hierarchy_name',
          columnNames: ['plant_id', 'department_id', 'name'],
        }),
      );
    }

    const assetsTable = await queryRunner.getTable('assets');
    const moduleColumnExists = assetsTable?.columns.some((column) => column.name === 'module_id') ?? false;
    if (!moduleColumnExists) {
      await queryRunner.addColumn(
        'assets',
        new TableColumn({
          name: 'module_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
      await queryRunner.createForeignKey(
        'assets',
        new TableForeignKey({
          name: 'fk_assets_module',
          columnNames: ['module_id'],
          referencedTableName: 'machine_modules',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
      await queryRunner.createIndex('assets', new TableIndex({ name: 'idx_assets_module', columnNames: ['module_id'] }));
    }

    const departmentRows = await queryRunner.manager
      .createQueryBuilder()
      .select('department.id', 'id')
      .addSelect('department.plant_id', 'plantId')
      .from('departments', 'department')
      .getRawMany<{ id: string; plantId: string | null }>();

    const moduleIdByDepartment = new Map<string, string>();
    for (const department of departmentRows) {
      const existing = await queryRunner.manager
        .createQueryBuilder()
        .select('module.id', 'id')
        .from('machine_modules', 'module')
        .where('module.department_id = :departmentId', { departmentId: department.id })
        .andWhere('LOWER(module.name) = :name', { name: 'general' })
        .getRawOne<{ id: string }>();

      if (existing?.id) {
        moduleIdByDepartment.set(department.id, existing.id);
        continue;
      }

      const moduleId = randomUUID();
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('machine_modules')
        .values({
          id: moduleId,
          code: 'GEN',
          name: 'General',
          description: 'Auto-created default module',
          plant_id: department.plantId ?? null,
          department_id: department.id,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
      moduleIdByDepartment.set(department.id, moduleId);
    }

    const fallbackDepartmentByPlant = new Map<string, string>();

    const assetRows = await queryRunner.manager
      .createQueryBuilder()
      .select('asset.id', 'id')
      .addSelect('asset.department_id', 'departmentId')
      .addSelect('asset.plant_id', 'plantId')
      .addSelect('asset.module_id', 'moduleId')
      .from('assets', 'asset')
      .where('asset.module_id IS NULL')
      .getRawMany<{ id: string; departmentId: string | null; plantId: string | null; moduleId: string | null }>();

    for (const asset of assetRows) {
      let departmentId = asset.departmentId;

      if (!departmentId) {
        const fallbackKey = asset.plantId ?? 'NO_PLANT';
        const existingFallback = fallbackDepartmentByPlant.get(fallbackKey);
        if (existingFallback) {
          departmentId = existingFallback;
        } else {
          const fallbackDepartmentId = randomUUID();
          const suffix = (asset.plantId ?? 'global').replace(/-/g, '').slice(0, 6).toUpperCase() || 'GLOBAL';
          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into('departments')
            .values({
              id: fallbackDepartmentId,
              name: 'General',
              code: `GEN-${suffix}`,
              plant_id: asset.plantId ?? null,
              parent_id: null,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .execute();
          fallbackDepartmentByPlant.set(fallbackKey, fallbackDepartmentId);
          departmentId = fallbackDepartmentId;
        }
      }

      let moduleId = moduleIdByDepartment.get(departmentId);
      if (!moduleId) {
        moduleId = randomUUID();
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into('machine_modules')
          .values({
            id: moduleId,
            code: 'GEN',
            name: 'General',
            description: 'Auto-created default module',
            plant_id: asset.plantId ?? null,
            department_id: departmentId,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .execute();
        moduleIdByDepartment.set(departmentId, moduleId);
      }

      await queryRunner.manager
        .createQueryBuilder()
        .update('assets')
        .set({ departmentId, moduleId })
        .where('id = :id', { id: asset.id })
        .execute();
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const assetsTable = await queryRunner.getTable('assets');
    const moduleFk = assetsTable?.foreignKeys.find((fk) => fk.name === 'fk_assets_module');
    if (moduleFk) {
      await queryRunner.dropForeignKey('assets', moduleFk);
    }
    const hasAssetsModuleIndex = assetsTable?.indices.some((index) => index.name === 'idx_assets_module');
    if (hasAssetsModuleIndex) {
      await queryRunner.dropIndex('assets', 'idx_assets_module');
    }
    const moduleColumn = assetsTable?.columns.find((column) => column.name === 'module_id');
    if (moduleColumn) {
      await queryRunner.dropColumn('assets', 'module_id');
    }

    const machineModulesTable = await queryRunner.getTable('machine_modules');
    if (machineModulesTable) {
      const plantFk = machineModulesTable.foreignKeys.find((fk) => fk.name === 'fk_machine_modules_plant');
      const deptFk = machineModulesTable.foreignKeys.find((fk) => fk.name === 'fk_machine_modules_department');
      if (plantFk) await queryRunner.dropForeignKey('machine_modules', plantFk);
      if (deptFk) await queryRunner.dropForeignKey('machine_modules', deptFk);

      if (machineModulesTable.indices.some((index) => index.name === 'idx_machine_modules_hierarchy_name')) {
        await queryRunner.dropIndex('machine_modules', 'idx_machine_modules_hierarchy_name');
      }
      if (machineModulesTable.indices.some((index) => index.name === 'idx_machine_modules_department')) {
        await queryRunner.dropIndex('machine_modules', 'idx_machine_modules_department');
      }
      if (machineModulesTable.indices.some((index) => index.name === 'idx_machine_modules_plant')) {
        await queryRunner.dropIndex('machine_modules', 'idx_machine_modules_plant');
      }
      await queryRunner.dropTable('machine_modules');
    }
  }
}
