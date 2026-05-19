import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class RbacEnhancements1700000000003 implements MigrationInterface {
  name = 'RbacEnhancements1700000000003';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasRoleDescription = await queryRunner.hasColumn('roles', 'description');
    if (!hasRoleDescription) {
      await queryRunner.query('ALTER TABLE roles ADD COLUMN description varchar NULL');
    }

    const hasRoleIsSystem = await queryRunner.hasColumn('roles', 'is_system');
    if (!hasRoleIsSystem) {
      await queryRunner.query("ALTER TABLE roles ADD COLUMN is_system boolean NOT NULL DEFAULT false");
    }

    await queryRunner.query("UPDATE roles SET is_system = true WHERE UPPER(name) IN ('SUPERADMIN', 'ADMIN', 'USER')");

    const hasRolePermissionsRoleId = await queryRunner.hasColumn('role_permissions', 'role_id');
    if (!hasRolePermissionsRoleId) {
      await queryRunner.query('ALTER TABLE role_permissions ADD COLUMN role_id uuid NULL');
    }

    const hasRolePermissionsModuleKey = await queryRunner.hasColumn('role_permissions', 'module_key');
    if (!hasRolePermissionsModuleKey) {
      await queryRunner.query('ALTER TABLE role_permissions ADD COLUMN module_key varchar NULL');
    }

    await queryRunner.query('UPDATE role_permissions rp SET module_key = COALESCE(module_key, rp.module_id)');
    await queryRunner.query('UPDATE role_permissions rp SET role_id = r.id FROM roles r WHERE rp.role_id IS NULL AND UPPER(r.name) = UPPER(rp.role)');

    const hasUserRolesRoleId = await queryRunner.hasColumn('user_roles', 'role_id');
    if (!hasUserRolesRoleId) {
      await queryRunner.query('ALTER TABLE user_roles ADD COLUMN role_id uuid NULL');
    }

    await queryRunner.query('UPDATE user_roles ur SET role_id = r.id FROM roles r WHERE ur.role_id IS NULL AND UPPER(r.name) = UPPER(ur.role)');

    const hasRoleDashboardKpis = await queryRunner.hasTable('role_dashboard_kpis');
    if (!hasRoleDashboardKpis) {
      await queryRunner.createTable(
        new Table({
          name: 'role_dashboard_kpis',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'uuid',
            },
            { name: 'role_id', type: 'uuid' },
            { name: 'kpi_key', type: 'varchar' },
            { name: 'is_visible', type: 'boolean', default: true },
            { name: 'display_order', type: 'int', default: 0 },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createForeignKey(
        'role_dashboard_kpis',
        new TableForeignKey({
          columnNames: ['role_id'],
          referencedTableName: 'roles',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createIndex(
        'role_dashboard_kpis',
        new TableIndex({ name: 'uq_role_dashboard_kpis_role_kpi', columnNames: ['role_id', 'kpi_key'], isUnique: true }),
      );
    }

    // More robust index checking for Postgres
    const existingIndices = await queryRunner.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'role_permissions'"
    );
    const hasRolePermIndex = existingIndices.some((idx: any) => idx.indexname === 'uq_role_permissions_role_module_key');

    if (!hasRolePermIndex) {
      await queryRunner.createIndex(
        'role_permissions',
        new TableIndex({ name: 'uq_role_permissions_role_module_key', columnNames: ['role_id', 'module_key'], isUnique: true }),
      );
    }

    const existingUserRoleIndices = await queryRunner.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'user_roles'"
    );
    const hasUserRoleIndex = existingUserRoleIndices.some((idx: any) => idx.indexname === 'uq_user_roles_user_roleid_plant');

    if (!hasUserRoleIndex) {
      await queryRunner.createIndex(
        'user_roles',
        new TableIndex({ name: 'uq_user_roles_user_roleid_plant', columnNames: ['user_id', 'role_id', 'plant_id'], isUnique: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const userRolesTable = await queryRunner.getTable('user_roles');
    if (userRolesTable?.indices.some((index) => index.name === 'uq_user_roles_user_roleid_plant')) {
      await queryRunner.dropIndex('user_roles', 'uq_user_roles_user_roleid_plant');
    }

    const rolePermTable = await queryRunner.getTable('role_permissions');
    if (rolePermTable?.indices.some((index) => index.name === 'uq_role_permissions_role_module_key')) {
      await queryRunner.dropIndex('role_permissions', 'uq_role_permissions_role_module_key');
    }

    const hasRoleDashboardKpis = await queryRunner.hasTable('role_dashboard_kpis');
    if (hasRoleDashboardKpis) {
      const table = await queryRunner.getTable('role_dashboard_kpis');
      const fk = table?.foreignKeys.find((item) => item.columnNames.includes('role_id'));
      if (fk) {
        await queryRunner.dropForeignKey('role_dashboard_kpis', fk);
      }
      await queryRunner.dropTable('role_dashboard_kpis');
    }

    if (await queryRunner.hasColumn('user_roles', 'role_id')) {
      await queryRunner.query('ALTER TABLE user_roles DROP COLUMN role_id');
    }

    if (await queryRunner.hasColumn('role_permissions', 'module_key')) {
      await queryRunner.query('ALTER TABLE role_permissions DROP COLUMN module_key');
    }

    if (await queryRunner.hasColumn('role_permissions', 'role_id')) {
      await queryRunner.query('ALTER TABLE role_permissions DROP COLUMN role_id');
    }

    if (await queryRunner.hasColumn('roles', 'is_system')) {
      await queryRunner.query('ALTER TABLE roles DROP COLUMN is_system');
    }

    if (await queryRunner.hasColumn('roles', 'description')) {
      await queryRunner.query('ALTER TABLE roles DROP COLUMN description');
    }
  }
}
