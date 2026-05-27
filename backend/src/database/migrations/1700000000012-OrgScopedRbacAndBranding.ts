import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

const DEFAULT_ORG_ROLE_KEYS = ['SUPER_ADMIN', 'PLANT_ADMIN', 'MAINTENANCE_USER'] as const;
const DEFAULT_FEATURE_KEYS = ['SAFETY', 'ESG', 'GATE_ENTRY', 'ADVANCED_ANALYTICS', 'HR'] as const;

export class OrgScopedRbacAndBranding1700000000012 implements MigrationInterface {
  name = 'OrgScopedRbacAndBranding1700000000012';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dateTimeType = this.dateTimeType(queryRunner);

    if (!(await queryRunner.hasTable('org_roles'))) {
      await queryRunner.createTable(
        new Table({
          name: 'org_roles',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'organization_id', type: 'uuid' },
            { name: 'key', type: 'varchar' },
            { name: 'name', type: 'varchar' },
            { name: 'is_system', type: 'boolean', default: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
          uniques: [{ name: 'uq_org_roles_org_key', columnNames: ['organization_id', 'key'] }],
        }),
      );
    }

    if (!(await queryRunner.hasTable('org_role_permissions'))) {
      await queryRunner.createTable(
        new Table({
          name: 'org_role_permissions',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'organization_id', type: 'uuid' },
            { name: 'role_id', type: 'uuid' },
            { name: 'module_key', type: 'varchar' },
            { name: 'actions', type: 'text', default: "'[]'" },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
          uniques: [{ name: 'uq_org_role_permissions_role_module', columnNames: ['role_id', 'module_key'] }],
        }),
      );
    }

    if (!(await queryRunner.hasTable('org_rbac_meta'))) {
      await queryRunner.createTable(
        new Table({
          name: 'org_rbac_meta',
          columns: [
            { name: 'organization_id', type: 'uuid', isPrimary: true },
            { name: 'version', type: 'int', default: 1 },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    if (!(await queryRunner.hasTable('organization_features'))) {
      await queryRunner.createTable(
        new Table({
          name: 'organization_features',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'organization_id', type: 'uuid' },
            { name: 'feature_key', type: 'varchar' },
            { name: 'enabled', type: 'boolean', default: false },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
          uniques: [{ name: 'uq_organization_features_org_key', columnNames: ['organization_id', 'feature_key'] }],
        }),
      );
    }

    if (!(await queryRunner.hasTable('branding_meta'))) {
      await queryRunner.createTable(
        new Table({
          name: 'branding_meta',
          columns: [
            { name: 'id', type: 'int', isPrimary: true },
            { name: 'version', type: 'int', default: 1 },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    const usersTable = await queryRunner.getTable('users');
    if (usersTable && !usersTable.columns.some((column) => column.name === 'org_role_id')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'org_role_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    const orgRolesTable = await queryRunner.getTable('org_roles');
    if (orgRolesTable && !orgRolesTable.foreignKeys.some((fk) => fk.name === 'fk_org_roles_organization_id')) {
      await queryRunner.createForeignKey(
        'org_roles',
        new TableForeignKey({
          name: 'fk_org_roles_organization_id',
          columnNames: ['organization_id'],
          referencedTableName: 'organizations',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const orgRolePermissionsTable = await queryRunner.getTable('org_role_permissions');
    if (orgRolePermissionsTable && !orgRolePermissionsTable.foreignKeys.some((fk) => fk.name === 'fk_org_role_permissions_org_id')) {
      await queryRunner.createForeignKey(
        'org_role_permissions',
        new TableForeignKey({
          name: 'fk_org_role_permissions_org_id',
          columnNames: ['organization_id'],
          referencedTableName: 'organizations',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
    if (orgRolePermissionsTable && !orgRolePermissionsTable.foreignKeys.some((fk) => fk.name === 'fk_org_role_permissions_role_id')) {
      await queryRunner.createForeignKey(
        'org_role_permissions',
        new TableForeignKey({
          name: 'fk_org_role_permissions_role_id',
          columnNames: ['role_id'],
          referencedTableName: 'org_roles',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const orgRbacMetaTable = await queryRunner.getTable('org_rbac_meta');
    if (orgRbacMetaTable && !orgRbacMetaTable.foreignKeys.some((fk) => fk.name === 'fk_org_rbac_meta_org_id')) {
      await queryRunner.createForeignKey(
        'org_rbac_meta',
        new TableForeignKey({
          name: 'fk_org_rbac_meta_org_id',
          columnNames: ['organization_id'],
          referencedTableName: 'organizations',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const orgFeaturesTable = await queryRunner.getTable('organization_features');
    if (orgFeaturesTable && !orgFeaturesTable.foreignKeys.some((fk) => fk.name === 'fk_organization_features_org_id')) {
      await queryRunner.createForeignKey(
        'organization_features',
        new TableForeignKey({
          name: 'fk_organization_features_org_id',
          columnNames: ['organization_id'],
          referencedTableName: 'organizations',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const usersAfterColumn = await queryRunner.getTable('users');
    if (usersAfterColumn && !usersAfterColumn.foreignKeys.some((fk) => fk.name === 'fk_users_org_role_id')) {
      await queryRunner.createForeignKey(
        'users',
        new TableForeignKey({
          name: 'fk_users_org_role_id',
          columnNames: ['org_role_id'],
          referencedTableName: 'org_roles',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }

    const orgRolesIdxTable = await queryRunner.getTable('org_roles');
    if (orgRolesIdxTable && !orgRolesIdxTable.indices.some((index) => index.name === 'idx_org_roles_organization_id')) {
      await queryRunner.createIndex(
        'org_roles',
        new TableIndex({ name: 'idx_org_roles_organization_id', columnNames: ['organization_id'] }),
      );
    }

    const orgPermissionsIdxTable = await queryRunner.getTable('org_role_permissions');
    if (orgPermissionsIdxTable && !orgPermissionsIdxTable.indices.some((index) => index.name === 'idx_org_role_permissions_org_id')) {
      await queryRunner.createIndex(
        'org_role_permissions',
        new TableIndex({ name: 'idx_org_role_permissions_org_id', columnNames: ['organization_id'] }),
      );
    }

    const usersIdxTable = await queryRunner.getTable('users');
    if (usersIdxTable && !usersIdxTable.indices.some((index) => index.name === 'idx_users_org_role_id')) {
      await queryRunner.createIndex(
        'users',
        new TableIndex({ name: 'idx_users_org_role_id', columnNames: ['org_role_id'] }),
      );
    }

    const orgFeaturesIdxTable = await queryRunner.getTable('organization_features');
    if (orgFeaturesIdxTable && !orgFeaturesIdxTable.indices.some((index) => index.name === 'idx_organization_features_org_id')) {
      await queryRunner.createIndex(
        'organization_features',
        new TableIndex({ name: 'idx_organization_features_org_id', columnNames: ['organization_id'] }),
      );
    }

    const organizations = await queryRunner.query('SELECT id FROM organizations');
    for (const row of organizations as Array<{ id: string }>) {
      const organizationId = row.id;
      for (const roleKey of DEFAULT_ORG_ROLE_KEYS) {
        const existingRole = await queryRunner.query(
          `SELECT id FROM org_roles WHERE organization_id = '${organizationId}' AND key = '${roleKey}' LIMIT 1`,
        );
        if (Array.isArray(existingRole) && existingRole.length > 0) {
          continue;
        }
        await queryRunner.query(
          `INSERT INTO org_roles (organization_id, key, name, is_system, is_active, created_at, updated_at)
           VALUES ('${organizationId}', '${roleKey}', '${roleKey}', TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
      }

      const existingMeta = await queryRunner.query(`SELECT organization_id FROM org_rbac_meta WHERE organization_id = '${organizationId}' LIMIT 1`);
      if (!Array.isArray(existingMeta) || existingMeta.length === 0) {
        await queryRunner.query(
          `INSERT INTO org_rbac_meta (organization_id, version, updated_at) VALUES ('${organizationId}', 1, CURRENT_TIMESTAMP)`,
        );
      }

      for (const featureKey of DEFAULT_FEATURE_KEYS) {
        const existingFeature = await queryRunner.query(
          `SELECT id FROM organization_features WHERE organization_id = '${organizationId}' AND feature_key = '${featureKey}' LIMIT 1`,
        );
        if (Array.isArray(existingFeature) && existingFeature.length > 0) {
          continue;
        }
        await queryRunner.query(
          `INSERT INTO organization_features (organization_id, feature_key, enabled, created_at, updated_at)
           VALUES ('${organizationId}', '${featureKey}', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
      }
    }

    const brandingMeta = await queryRunner.query('SELECT id FROM branding_meta WHERE id = 1 LIMIT 1');
    if (!Array.isArray(brandingMeta) || brandingMeta.length === 0) {
      await queryRunner.query('INSERT INTO branding_meta (id, version, updated_at) VALUES (1, 1, CURRENT_TIMESTAMP)');
    }

    const userRows = await queryRunner.query(`
      SELECT
        u.id AS user_id,
        u.organization_id AS organization_id,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = u.id
              AND UPPER(REPLACE(ur.role, ' ', '_')) IN ('SUPER_ADMIN', 'SUPER_ADMIN')
          ) THEN 'SUPER_ADMIN'
          WHEN EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = u.id
              AND UPPER(REPLACE(ur.role, ' ', '_')) = 'PLANT_ADMIN'
          ) THEN 'PLANT_ADMIN'
          ELSE 'MAINTENANCE_USER'
        END AS role_key
      FROM users u
      WHERE u.organization_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = u.id
            AND UPPER(REPLACE(ur.role, ' ', '_')) = 'ROOT_ADMIN'
        )
    `);

    for (const row of userRows as Array<{ user_id: string; organization_id: string; role_key: string }>) {
      const roleRows = await queryRunner.query(
        `SELECT id FROM org_roles
         WHERE organization_id = '${row.organization_id}'
           AND key = '${row.role_key}'
         LIMIT 1`,
      );
      const orgRoleId = Array.isArray(roleRows) && roleRows.length > 0 ? (roleRows[0] as { id: string }).id : null;
      if (!orgRoleId) continue;
      await queryRunner.query(`UPDATE users SET org_role_id = '${orgRoleId}' WHERE id = '${row.user_id}'`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable('users');
    const userOrgRoleFk = usersTable?.foreignKeys.find((fk) => fk.name === 'fk_users_org_role_id');
    if (userOrgRoleFk) {
      await queryRunner.dropForeignKey('users', userOrgRoleFk);
    }
    const userOrgRoleIdx = usersTable?.indices.find((idx) => idx.name === 'idx_users_org_role_id');
    if (userOrgRoleIdx) {
      await queryRunner.dropIndex('users', userOrgRoleIdx);
    }
    if (usersTable?.columns.some((column) => column.name === 'org_role_id')) {
      await queryRunner.dropColumn('users', 'org_role_id');
    }

    const orgFeaturesTable = await queryRunner.getTable('organization_features');
    const orgFeaturesFk = orgFeaturesTable?.foreignKeys.find((fk) => fk.name === 'fk_organization_features_org_id');
    if (orgFeaturesFk) {
      await queryRunner.dropForeignKey('organization_features', orgFeaturesFk);
    }
    const orgFeaturesIdx = orgFeaturesTable?.indices.find((idx) => idx.name === 'idx_organization_features_org_id');
    if (orgFeaturesIdx) {
      await queryRunner.dropIndex('organization_features', orgFeaturesIdx);
    }
    if (orgFeaturesTable) {
      await queryRunner.dropTable('organization_features');
    }

    const orgRbacMetaTable = await queryRunner.getTable('org_rbac_meta');
    const orgRbacMetaFk = orgRbacMetaTable?.foreignKeys.find((fk) => fk.name === 'fk_org_rbac_meta_org_id');
    if (orgRbacMetaFk) {
      await queryRunner.dropForeignKey('org_rbac_meta', orgRbacMetaFk);
    }
    if (orgRbacMetaTable) {
      await queryRunner.dropTable('org_rbac_meta');
    }

    const orgPermissionsTable = await queryRunner.getTable('org_role_permissions');
    const orgPermissionsOrgFk = orgPermissionsTable?.foreignKeys.find((fk) => fk.name === 'fk_org_role_permissions_org_id');
    if (orgPermissionsOrgFk) {
      await queryRunner.dropForeignKey('org_role_permissions', orgPermissionsOrgFk);
    }
    const orgPermissionsRoleFk = orgPermissionsTable?.foreignKeys.find((fk) => fk.name === 'fk_org_role_permissions_role_id');
    if (orgPermissionsRoleFk) {
      await queryRunner.dropForeignKey('org_role_permissions', orgPermissionsRoleFk);
    }
    const orgPermissionsIdx = orgPermissionsTable?.indices.find((idx) => idx.name === 'idx_org_role_permissions_org_id');
    if (orgPermissionsIdx) {
      await queryRunner.dropIndex('org_role_permissions', orgPermissionsIdx);
    }
    if (orgPermissionsTable) {
      await queryRunner.dropTable('org_role_permissions');
    }

    const orgRolesTable = await queryRunner.getTable('org_roles');
    const orgRolesOrgFk = orgRolesTable?.foreignKeys.find((fk) => fk.name === 'fk_org_roles_organization_id');
    if (orgRolesOrgFk) {
      await queryRunner.dropForeignKey('org_roles', orgRolesOrgFk);
    }
    const orgRolesIdx = orgRolesTable?.indices.find((idx) => idx.name === 'idx_org_roles_organization_id');
    if (orgRolesIdx) {
      await queryRunner.dropIndex('org_roles', orgRolesIdx);
    }
    if (orgRolesTable) {
      await queryRunner.dropTable('org_roles');
    }

    if (await queryRunner.hasTable('branding_meta')) {
      await queryRunner.dropTable('branding_meta');
    }
  }
}

