import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class EnterpriseSmartOpsFoundation1700000000006 implements MigrationInterface {
  name = 'EnterpriseSmartOpsFoundation1700000000006';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private async addVersionColumn(queryRunner: QueryRunner, tableName: string) {
    if (!(await queryRunner.hasColumn(tableName, 'version'))) {
      await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN version int NOT NULL DEFAULT 1`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dateTime = this.dateTimeType(queryRunner);

    await this.addVersionColumn(queryRunner, 'plants');
    await this.addVersionColumn(queryRunner, 'departments');
    await this.addVersionColumn(queryRunner, 'machine_modules');
    await this.addVersionColumn(queryRunner, 'assets');
    await this.addVersionColumn(queryRunner, 'asset_performance_logs');
    await this.addVersionColumn(queryRunner, 'work_orders');

    if (!(await queryRunner.hasColumn('assets', 'asset_health_score'))) {
      await queryRunner.query('ALTER TABLE assets ADD COLUMN asset_health_score decimal(5,2) NOT NULL DEFAULT 100');
    }
    if (!(await queryRunner.hasColumn('assets', 'risk_level'))) {
      await queryRunner.query("ALTER TABLE assets ADD COLUMN risk_level varchar NOT NULL DEFAULT 'LOW'");
    }
    if (!(await queryRunner.hasColumn('assets', 'failure_probability'))) {
      await queryRunner.query('ALTER TABLE assets ADD COLUMN failure_probability decimal(6,4) NOT NULL DEFAULT 0');
    }

    if (!(await queryRunner.hasColumn('ghg_activity_data', 'scope_category'))) {
      await queryRunner.query("ALTER TABLE ghg_activity_data ADD COLUMN scope_category varchar NOT NULL DEFAULT 'SCOPE_2'");
    }
    if (!(await queryRunner.hasColumn('ghg_activity_data', 'production_output'))) {
      await queryRunner.query('ALTER TABLE ghg_activity_data ADD COLUMN production_output decimal(14,3) NULL');
    }

    if (!(await queryRunner.hasTable('feature_flags'))) {
      await queryRunner.createTable(
        new Table({
          name: 'feature_flags',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'key', type: 'varchar' },
            { name: 'enabled', type: 'boolean', default: false },
            { name: 'environment', type: 'varchar', default: "'all'" },
            { name: 'description', type: 'varchar', isNullable: true },
            { name: 'version', type: 'int', default: 1 },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createIndex('feature_flags', new TableIndex({ name: 'idx_feature_flags_key_env', columnNames: ['key', 'environment'], isUnique: true }));
    }

    if (!(await queryRunner.hasTable('alerts_config'))) {
      await queryRunner.createTable(
        new Table({
          name: 'alerts_config',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'asset_type', type: 'varchar', isNullable: true },
            { name: 'metric_key', type: 'varchar' },
            { name: 'threshold_value', type: 'decimal', precision: 18, scale: 6 },
            { name: 'comparison_type', type: 'varchar' },
            { name: 'severity', type: 'varchar', default: "'MEDIUM'" },
            { name: 'notify_roles', type: 'text', default: "'[]'" },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'version', type: 'int', default: 1 },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createForeignKey(
        'alerts_config',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
      await queryRunner.createIndex(
        'alerts_config',
        new TableIndex({ name: 'idx_alerts_config_scope', columnNames: ['plant_id', 'asset_type', 'metric_key', 'comparison_type'], isUnique: true }),
      );
    }

    if (!(await queryRunner.hasTable('alerts_log'))) {
      await queryRunner.createTable(
        new Table({
          name: 'alerts_log',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'asset_id', type: 'uuid', isNullable: true },
            { name: 'metric_key', type: 'varchar' },
            { name: 'actual_value', type: 'decimal', precision: 18, scale: 6 },
            { name: 'threshold_value', type: 'decimal', precision: 18, scale: 6 },
            { name: 'comparison_type', type: 'varchar' },
            { name: 'severity', type: 'varchar', default: "'MEDIUM'" },
            { name: 'triggered_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'acknowledged_by', type: 'uuid', isNullable: true },
            { name: 'acknowledged_at', type: dateTime, isNullable: true },
            { name: 'resolved_by', type: 'uuid', isNullable: true },
            { name: 'resolved_at', type: dateTime, isNullable: true },
            { name: 'status', type: 'varchar', default: "'OPEN'" },
            { name: 'message', type: 'text', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'version', type: 'int', default: 1 },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createForeignKey(
        'alerts_log',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'alerts_log',
        new TableForeignKey({
          columnNames: ['asset_id'],
          referencedTableName: 'assets',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
      await queryRunner.createForeignKey(
        'alerts_log',
        new TableForeignKey({
          columnNames: ['acknowledged_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
      await queryRunner.createForeignKey(
        'alerts_log',
        new TableForeignKey({
          columnNames: ['resolved_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
      await queryRunner.createIndex('alerts_log', new TableIndex({ name: 'idx_alerts_log_plant_status', columnNames: ['plant_id', 'status', 'triggered_at'] }));
      await queryRunner.createIndex('alerts_log', new TableIndex({ name: 'idx_alerts_log_asset_metric', columnNames: ['asset_id', 'metric_key'] }));
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dropTableSafely = async (tableName: string) => {
      if (!(await queryRunner.hasTable(tableName))) return;
      const table = await queryRunner.getTable(tableName);
      if (table?.foreignKeys.length) {
        for (const foreignKey of table.foreignKeys) {
          await queryRunner.dropForeignKey(tableName, foreignKey);
        }
      }
      if (table?.indices.length) {
        for (const index of table.indices) {
          await queryRunner.dropIndex(tableName, index);
        }
      }
      await queryRunner.dropTable(tableName);
    };

    await dropTableSafely('alerts_log');
    await dropTableSafely('alerts_config');
    await dropTableSafely('feature_flags');

    if (await queryRunner.hasColumn('ghg_activity_data', 'production_output')) {
      await queryRunner.query('ALTER TABLE ghg_activity_data DROP COLUMN production_output');
    }
    if (await queryRunner.hasColumn('ghg_activity_data', 'scope_category')) {
      await queryRunner.query('ALTER TABLE ghg_activity_data DROP COLUMN scope_category');
    }
    if (await queryRunner.hasColumn('assets', 'failure_probability')) {
      await queryRunner.query('ALTER TABLE assets DROP COLUMN failure_probability');
    }
    if (await queryRunner.hasColumn('assets', 'risk_level')) {
      await queryRunner.query('ALTER TABLE assets DROP COLUMN risk_level');
    }
    if (await queryRunner.hasColumn('assets', 'asset_health_score')) {
      await queryRunner.query('ALTER TABLE assets DROP COLUMN asset_health_score');
    }

    const versionTables = ['work_orders', 'asset_performance_logs', 'assets', 'machine_modules', 'departments', 'plants'];
    for (const tableName of versionTables) {
      if (await queryRunner.hasColumn(tableName, 'version')) {
        await queryRunner.query(`ALTER TABLE ${tableName} DROP COLUMN version`);
      }
    }
  }
}
