import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

function buildIndexName(tableName: string, suffix: string) {
  const base = `idx_${tableName}_${suffix}`.replace(/[^a-zA-Z0-9_]/g, '_');
  return base.length > 60 ? `${base.slice(0, 60)}_${suffix.slice(0, 2)}` : base;
}

export class AddPlantScopeIndexes1700000000010 implements MigrationInterface {
  name = 'AddPlantScopeIndexes1700000000010';

  private readonly plantScopedTables = [
    'departments',
    'cost_centers',
    'machine_modules',
    'assets',
    'work_orders',
    'pm_schedules',
    'calibration_records',
    'amc_contracts',
    'log_entries',
    'log_templates',
    'gate_entries',
    'safety_incidents',
    'safety_metrics',
    'spare_items',
    'stock_requests',
    'asset_performance_logs',
    'asset_reliability_kpis',
    'energy_meter_readings',
    'ghg_activity_data',
  ];

  private async ensureIndex(queryRunner: QueryRunner, tableName: string, index: TableIndex) {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    if (table.indices.some((item) => item.name === index.name)) return;
    await queryRunner.createIndex(tableName, index);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of this.plantScopedTables) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      const table = await queryRunner.getTable(tableName);
      if (!table) continue;

      const hasPlantId = table.columns.some((column) => column.name === 'plant_id');
      if (!hasPlantId) continue;

      const hasCreatedAt = table.columns.some((column) => column.name === 'created_at');
      const hasId = table.columns.some((column) => column.name === 'id');

      if (hasCreatedAt) {
        await this.ensureIndex(
          queryRunner,
          tableName,
          new TableIndex({
            name: buildIndexName(tableName, 'plant_created'),
            columnNames: ['plant_id', 'created_at'],
          }),
        );
      }

      if (hasId) {
        await this.ensureIndex(
          queryRunner,
          tableName,
          new TableIndex({
            name: buildIndexName(tableName, 'plant_id'),
            columnNames: ['plant_id', 'id'],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of this.plantScopedTables) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      const indexNames = [
        buildIndexName(tableName, 'plant_created'),
        buildIndexName(tableName, 'plant_id'),
      ];

      const table = await queryRunner.getTable(tableName);
      if (!table) continue;
      for (const indexName of indexNames) {
        const index = table.indices.find((item) => item.name === indexName);
        if (index) {
          await queryRunner.dropIndex(tableName, index);
        }
      }
    }
  }
}

