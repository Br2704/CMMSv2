import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAssetEnergyMeterDataPoints1700000000036 implements MigrationInterface {
  name = 'AddAssetEnergyMeterDataPoints1700000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('asset_energy_meter_configs'))) {
      return;
    }

    if (!(await queryRunner.hasColumn('asset_energy_meter_configs', 'data_points'))) {
      await queryRunner.addColumn(
        'asset_energy_meter_configs',
        new TableColumn({
          name: 'data_points',
          type: 'text',
          isNullable: false,
          default: "'[]'",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('asset_energy_meter_configs'))) {
      return;
    }

    if (await queryRunner.hasColumn('asset_energy_meter_configs', 'data_points')) {
      await queryRunner.dropColumn('asset_energy_meter_configs', 'data_points');
    }
  }
}
