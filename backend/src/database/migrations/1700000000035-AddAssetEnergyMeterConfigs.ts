import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddAssetEnergyMeterConfigs1700000000035 implements MigrationInterface {
  name = 'AddAssetEnergyMeterConfigs1700000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('asset_energy_meter_configs')) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'asset_energy_meter_configs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'asset_id', type: 'uuid' },
          { name: 'plant_id', type: 'uuid' },
          { name: 'checklist_name', type: 'varchar', default: `'Energy Meter Checklist'` },
          { name: 'meter_name', type: 'varchar' },
          { name: 'connection_type', type: 'varchar', default: `'MODBUS_TCP'` },
          { name: 'ip_address', type: 'varchar', isNullable: true },
          { name: 'port', type: 'int', default: 502 },
          { name: 'modbus_slave_id', type: 'int', isNullable: true },
          { name: 'modbus_register', type: 'varchar', isNullable: true },
          { name: 'baud_rate', type: 'int', isNullable: true },
          { name: 'parity', type: 'varchar', isNullable: true },
          { name: 'stop_bits', type: 'int', isNullable: true },
          { name: 'poll_interval_seconds', type: 'int', default: 60 },
          { name: 'driver_type', type: 'varchar', default: `'DOTNET_RS485_BRIDGE'` },
          { name: 'bridge_endpoint', type: 'varchar', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
        ],
      }),
    );

    await queryRunner.createForeignKeys('asset_energy_meter_configs', [
      new TableForeignKey({
        columnNames: ['asset_id'],
        referencedTableName: 'assets',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createIndices('asset_energy_meter_configs', [
      new TableIndex({
        name: 'idx_asset_energy_meter_configs_asset_active',
        columnNames: ['asset_id', 'is_active'],
      }),
      new TableIndex({
        name: 'idx_asset_energy_meter_configs_plant_active',
        columnNames: ['plant_id', 'is_active'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('asset_energy_meter_configs'))) {
      return;
    }
    await queryRunner.dropTable('asset_energy_meter_configs');
  }
}
