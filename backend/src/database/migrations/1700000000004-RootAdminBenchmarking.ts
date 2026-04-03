import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class RootAdminBenchmarking1700000000004 implements MigrationInterface {
  name = 'RootAdminBenchmarking1700000000004';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('assets', 'asset_type'))) {
      await queryRunner.query("ALTER TABLE assets ADD COLUMN asset_type varchar NOT NULL DEFAULT 'PUMP'");
    }

    if (!(await queryRunner.hasColumn('assets', 'manufacturer'))) {
      await queryRunner.query('ALTER TABLE assets ADD COLUMN manufacturer varchar NULL');
    }

    if (!(await queryRunner.hasColumn('assets', 'rated_capacity'))) {
      await queryRunner.query('ALTER TABLE assets ADD COLUMN rated_capacity decimal(12,3) NULL');
    }

    if (!(await queryRunner.hasColumn('assets', 'capacity_unit'))) {
      await queryRunner.query('ALTER TABLE assets ADD COLUMN capacity_unit varchar NULL');
    }

    if (!(await queryRunner.hasTable('asset_performance_logs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'asset_performance_logs',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'uuid',
            },
            { name: 'plant_id', type: 'uuid' },
            { name: 'asset_id', type: 'uuid' },
            { name: 'captured_at', type: this.dateTimeType(queryRunner), isNullable: false },
            { name: 'runtime_hours', type: 'decimal', precision: 14, scale: 3, isNullable: true },
            { name: 'energy_kwh', type: 'decimal', precision: 14, scale: 3, isNullable: true },
            { name: 'production_output', type: 'decimal', precision: 14, scale: 3, isNullable: true },
            { name: 'efficiency_value', type: 'decimal', precision: 14, scale: 4, isNullable: true },
            { name: 'efficiency_unit', type: 'varchar', isNullable: true },
            { name: 'notes', type: 'varchar', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createForeignKey(
        'asset_performance_logs',
        new TableForeignKey({
          columnNames: ['asset_id'],
          referencedTableName: 'assets',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'asset_performance_logs',
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createIndex(
        'asset_performance_logs',
        new TableIndex({ name: 'idx_asset_performance_logs_asset_captured_at', columnNames: ['asset_id', 'captured_at'] }),
      );

      await queryRunner.createIndex(
        'asset_performance_logs',
        new TableIndex({ name: 'idx_asset_performance_logs_plant_captured_at', columnNames: ['plant_id', 'captured_at'] }),
      );
    }

    await queryRunner.query("UPDATE roles SET is_system = true WHERE UPPER(name) IN ('SUPERADMIN', 'ROOT_ADMIN', 'ADMIN', 'USER')");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('asset_performance_logs')) {
      const table = await queryRunner.getTable('asset_performance_logs');
      const assetFk = table?.foreignKeys.find((fk) => fk.columnNames.includes('asset_id'));
      if (assetFk) {
        await queryRunner.dropForeignKey('asset_performance_logs', assetFk);
      }

      const plantFk = table?.foreignKeys.find((fk) => fk.columnNames.includes('plant_id'));
      if (plantFk) {
        await queryRunner.dropForeignKey('asset_performance_logs', plantFk);
      }

      if (table?.indices.some((index) => index.name === 'idx_asset_performance_logs_asset_captured_at')) {
        await queryRunner.dropIndex('asset_performance_logs', 'idx_asset_performance_logs_asset_captured_at');
      }

      if (table?.indices.some((index) => index.name === 'idx_asset_performance_logs_plant_captured_at')) {
        await queryRunner.dropIndex('asset_performance_logs', 'idx_asset_performance_logs_plant_captured_at');
      }

      await queryRunner.dropTable('asset_performance_logs');
    }

    if (await queryRunner.hasColumn('assets', 'capacity_unit')) {
      await queryRunner.query('ALTER TABLE assets DROP COLUMN capacity_unit');
    }

    if (await queryRunner.hasColumn('assets', 'rated_capacity')) {
      await queryRunner.query('ALTER TABLE assets DROP COLUMN rated_capacity');
    }

    if (await queryRunner.hasColumn('assets', 'manufacturer')) {
      await queryRunner.query('ALTER TABLE assets DROP COLUMN manufacturer');
    }

    if (await queryRunner.hasColumn('assets', 'asset_type')) {
      await queryRunner.query('ALTER TABLE assets DROP COLUMN asset_type');
    }
  }
}
