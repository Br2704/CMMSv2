import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddOrganizationsGovernance1700000000011 implements MigrationInterface {
  name = 'AddOrganizationsGovernance1700000000011';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dateTimeType = this.dateTimeType(queryRunner);

    if (!(await queryRunner.hasTable('organizations'))) {
      await queryRunner.createTable(
        new Table({
          name: 'organizations',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'uuid',
            },
            { name: 'name', type: 'varchar', isUnique: true },
            { name: 'code', type: 'varchar', isNullable: true, isUnique: true },
            { name: 'logo_url', type: 'text', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    const plantsTable = await queryRunner.getTable('plants');
    if (plantsTable && !plantsTable.columns.some((column) => column.name === 'organization_id')) {
      await queryRunner.addColumn(
        'plants',
        new TableColumn({
          name: 'organization_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    const usersTable = await queryRunner.getTable('users');
    if (usersTable && !usersTable.columns.some((column) => column.name === 'organization_id')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'organization_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    const latestPlantsTable = await queryRunner.getTable('plants');
    if (latestPlantsTable && !latestPlantsTable.foreignKeys.some((fk) => fk.name === 'fk_plants_organization_id')) {
      await queryRunner.createForeignKey(
        'plants',
        new TableForeignKey({
          name: 'fk_plants_organization_id',
          columnNames: ['organization_id'],
          referencedTableName: 'organizations',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
        }),
      );
    }

    const latestUsersTable = await queryRunner.getTable('users');
    if (latestUsersTable && !latestUsersTable.foreignKeys.some((fk) => fk.name === 'fk_users_organization_id')) {
      await queryRunner.createForeignKey(
        'users',
        new TableForeignKey({
          name: 'fk_users_organization_id',
          columnNames: ['organization_id'],
          referencedTableName: 'organizations',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }

    const plantsIndexTable = await queryRunner.getTable('plants');
    if (plantsIndexTable && !plantsIndexTable.indices.some((index) => index.name === 'idx_plants_organization_id')) {
      await queryRunner.createIndex(
        'plants',
        new TableIndex({
          name: 'idx_plants_organization_id',
          columnNames: ['organization_id'],
        }),
      );
    }

    const usersIndexTable = await queryRunner.getTable('users');
    if (usersIndexTable && !usersIndexTable.indices.some((index) => index.name === 'idx_users_organization_id')) {
      await queryRunner.createIndex(
        'users',
        new TableIndex({
          name: 'idx_users_organization_id',
          columnNames: ['organization_id'],
        }),
      );
    }

    const rows = await queryRunner.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
    let defaultOrganizationId: string | null = rows?.[0]?.id ?? null;
    if (!defaultOrganizationId) {
      defaultOrganizationId = randomUUID();
      await queryRunner.query(
        `
          INSERT INTO organizations (id, name, code, logo_url, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [defaultOrganizationId, 'Default Organization', 'DEFAULT'],
      );
    }

    await queryRunner.query('UPDATE plants SET organization_id = $1 WHERE organization_id IS NULL', [defaultOrganizationId]);

    await queryRunner.query(`
      UPDATE users AS u
      SET organization_id = p.organization_id
      FROM profiles AS pr
      JOIN plants AS p ON p.id = pr.plant_id
      WHERE u.id = pr.user_id
        AND u.organization_id IS NULL
        AND p.organization_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE users AS u
      SET organization_id = NULL
      FROM user_roles AS ur
      WHERE ur.user_id = u.id
        AND UPPER(ur.role) = 'ROOT_ADMIN'
    `);

    const plantsAfterBackfill = await queryRunner.getTable('plants');
    const organizationColumn = plantsAfterBackfill?.columns.find((column) => column.name === 'organization_id');
    if (organizationColumn?.isNullable) {
      await queryRunner.changeColumn(
        'plants',
        organizationColumn,
        new TableColumn({
          name: 'organization_id',
          type: 'uuid',
          isNullable: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const plantsTable = await queryRunner.getTable('plants');
    const plantsOrgColumn = plantsTable?.columns.find((column) => column.name === 'organization_id');
    if (plantsOrgColumn && !plantsOrgColumn.isNullable) {
      await queryRunner.changeColumn(
        'plants',
        plantsOrgColumn,
        new TableColumn({
          name: 'organization_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    const latestPlantsTable = await queryRunner.getTable('plants');
    const plantsOrgFk = latestPlantsTable?.foreignKeys.find((fk) => fk.name === 'fk_plants_organization_id');
    if (plantsOrgFk) {
      await queryRunner.dropForeignKey('plants', plantsOrgFk);
    }
    const plantsOrgIdx = latestPlantsTable?.indices.find((index) => index.name === 'idx_plants_organization_id');
    if (plantsOrgIdx) {
      await queryRunner.dropIndex('plants', plantsOrgIdx);
    }
    if (latestPlantsTable?.columns.some((column) => column.name === 'organization_id')) {
      await queryRunner.dropColumn('plants', 'organization_id');
    }

    const usersTable = await queryRunner.getTable('users');
    const usersOrgFk = usersTable?.foreignKeys.find((fk) => fk.name === 'fk_users_organization_id');
    if (usersOrgFk) {
      await queryRunner.dropForeignKey('users', usersOrgFk);
    }
    const usersOrgIdx = usersTable?.indices.find((index) => index.name === 'idx_users_organization_id');
    if (usersOrgIdx) {
      await queryRunner.dropIndex('users', usersOrgIdx);
    }
    if (usersTable?.columns.some((column) => column.name === 'organization_id')) {
      await queryRunner.dropColumn('users', 'organization_id');
    }

    if (await queryRunner.hasTable('organizations')) {
      await queryRunner.dropTable('organizations');
    }
  }
}

