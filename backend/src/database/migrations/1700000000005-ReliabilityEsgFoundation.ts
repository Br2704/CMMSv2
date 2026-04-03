import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class ReliabilityEsgFoundation1700000000005 implements MigrationInterface {
  name = 'ReliabilityEsgFoundation1700000000005';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dateTime = this.dateTimeType(queryRunner);

    if (!(await queryRunner.hasColumn('work_orders', 'started_at'))) {
      await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN started_at ${dateTime} NULL`);
    }
    if (!(await queryRunner.hasColumn('work_orders', 'resolved_at'))) {
      await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN resolved_at ${dateTime} NULL`);
    }
    if (!(await queryRunner.hasColumn('work_orders', 'downtime_start_at'))) {
      await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN downtime_start_at ${dateTime} NULL`);
    }
    if (!(await queryRunner.hasColumn('work_orders', 'downtime_end_at'))) {
      await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN downtime_end_at ${dateTime} NULL`);
    }
    if (!(await queryRunner.hasColumn('work_orders', 'is_failure_event'))) {
      await queryRunner.query('ALTER TABLE work_orders ADD COLUMN is_failure_event boolean NOT NULL DEFAULT false');
    }

    if (!(await queryRunner.hasTable('asset_downtime_events'))) {
      await queryRunner.createTable(
        new Table({
          name: 'asset_downtime_events',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'asset_id', type: 'uuid' },
            { name: 'work_order_id', type: 'uuid', isNullable: true },
            { name: 'started_at', type: dateTime, isNullable: false },
            { name: 'ended_at', type: dateTime, isNullable: true },
            { name: 'is_failure_event', type: 'boolean', default: true },
            { name: 'duration_minutes', type: 'int', isNullable: true },
            { name: 'reason', type: 'varchar', isNullable: true },
            { name: 'notes', type: 'text', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createForeignKey(
        'asset_downtime_events',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'asset_downtime_events',
        new TableForeignKey({
          columnNames: ['asset_id'],
          referencedTableName: 'assets',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'asset_downtime_events',
        new TableForeignKey({
          columnNames: ['work_order_id'],
          referencedTableName: 'work_orders',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
      await queryRunner.createIndex(
        'asset_downtime_events',
        new TableIndex({ name: 'idx_downtime_asset_started', columnNames: ['asset_id', 'started_at'] }),
      );
      await queryRunner.createIndex(
        'asset_downtime_events',
        new TableIndex({ name: 'idx_downtime_plant_started', columnNames: ['plant_id', 'started_at'] }),
      );
    }

    if (!(await queryRunner.hasTable('asset_reliability_kpis'))) {
      await queryRunner.createTable(
        new Table({
          name: 'asset_reliability_kpis',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'asset_id', type: 'uuid' },
            { name: 'window_start', type: dateTime },
            { name: 'window_end', type: dateTime },
            { name: 'failures', type: 'int', default: 0 },
            { name: 'downtime_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 },
            { name: 'uptime_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 },
            { name: 'mttr_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 },
            { name: 'mtbf_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 },
            { name: 'mttf_minutes', type: 'decimal', precision: 14, scale: 3, default: 0 },
            { name: 'snapshot_meta', type: 'text', isNullable: true },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createForeignKey(
        'asset_reliability_kpis',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'asset_reliability_kpis',
        new TableForeignKey({
          columnNames: ['asset_id'],
          referencedTableName: 'assets',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createIndex(
        'asset_reliability_kpis',
        new TableIndex({ name: 'idx_rel_kpi_asset_window', columnNames: ['asset_id', 'window_start', 'window_end'] }),
      );
    }

    if (!(await queryRunner.hasTable('energy_meter_readings'))) {
      await queryRunner.createTable(
        new Table({
          name: 'energy_meter_readings',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'meter_id', type: 'varchar' },
            { name: 'captured_at', type: dateTime },
            { name: 'kwh', type: 'decimal', precision: 14, scale: 3 },
            { name: 'demand_kw', type: 'decimal', precision: 14, scale: 3, isNullable: true },
            { name: 'notes', type: 'text', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createForeignKey(
        'energy_meter_readings',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createIndex(
        'energy_meter_readings',
        new TableIndex({ name: 'idx_energy_meter_readings_plant_captured', columnNames: ['plant_id', 'captured_at'] }),
      );
    }

    if (!(await queryRunner.hasTable('emissions_factors'))) {
      await queryRunner.createTable(
        new Table({
          name: 'emissions_factors',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'factor_key', type: 'varchar' },
            { name: 'unit', type: 'varchar' },
            { name: 'value', type: 'decimal', precision: 14, scale: 6 },
            { name: 'valid_from', type: dateTime },
            { name: 'valid_to', type: dateTime, isNullable: true },
            { name: 'region', type: 'varchar', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createIndex(
        'emissions_factors',
        new TableIndex({ name: 'idx_emissions_factors_lookup', columnNames: ['factor_key', 'region', 'valid_from'] }),
      );
    }

    if (!(await queryRunner.hasTable('ghg_activity_data'))) {
      await queryRunner.createTable(
        new Table({
          name: 'ghg_activity_data',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'source_type', type: 'varchar' },
            { name: 'quantity', type: 'decimal', precision: 14, scale: 3 },
            { name: 'unit', type: 'varchar' },
            { name: 'period_start', type: dateTime },
            { name: 'period_end', type: dateTime },
            { name: 'computed_co2e', type: 'decimal', precision: 14, scale: 6, default: 0 },
            { name: 'factor_used', type: 'varchar', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createForeignKey(
        'ghg_activity_data',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createIndex(
        'ghg_activity_data',
        new TableIndex({ name: 'idx_ghg_activity_plant_period', columnNames: ['plant_id', 'period_start', 'period_end'] }),
      );
    }

    if (!(await queryRunner.hasTable('esg_reports'))) {
      await queryRunner.createTable(
        new Table({
          name: 'esg_reports',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'report_type', type: 'varchar' },
            { name: 'period_start', type: dateTime },
            { name: 'period_end', type: dateTime },
            { name: 'generated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'generated_by', type: 'uuid', isNullable: true },
            { name: 'storage_path', type: 'varchar', isNullable: true },
            { name: 'summary', type: 'text', isNullable: true },
            { name: 'created_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTime, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createForeignKey(
        'esg_reports',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'esg_reports',
        new TableForeignKey({
          columnNames: ['generated_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
      await queryRunner.createIndex(
        'esg_reports',
        new TableIndex({ name: 'idx_esg_reports_plant_type_period', columnNames: ['plant_id', 'report_type', 'period_start', 'period_end'] }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dropTableSafely = async (tableName: string) => {
      if (!(await queryRunner.hasTable(tableName))) {
        return;
      }
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

    await dropTableSafely('esg_reports');
    await dropTableSafely('ghg_activity_data');
    await dropTableSafely('emissions_factors');
    await dropTableSafely('energy_meter_readings');
    await dropTableSafely('asset_reliability_kpis');
    await dropTableSafely('asset_downtime_events');

    if (await queryRunner.hasColumn('work_orders', 'is_failure_event')) {
      await queryRunner.query('ALTER TABLE work_orders DROP COLUMN is_failure_event');
    }
    if (await queryRunner.hasColumn('work_orders', 'downtime_end_at')) {
      await queryRunner.query('ALTER TABLE work_orders DROP COLUMN downtime_end_at');
    }
    if (await queryRunner.hasColumn('work_orders', 'downtime_start_at')) {
      await queryRunner.query('ALTER TABLE work_orders DROP COLUMN downtime_start_at');
    }
    if (await queryRunner.hasColumn('work_orders', 'resolved_at')) {
      await queryRunner.query('ALTER TABLE work_orders DROP COLUMN resolved_at');
    }
    if (await queryRunner.hasColumn('work_orders', 'started_at')) {
      await queryRunner.query('ALTER TABLE work_orders DROP COLUMN started_at');
    }
  }
}
