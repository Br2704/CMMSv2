import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAmcContractAdvancedConfig1700000000026 implements MigrationInterface {
  name = 'AddAmcContractAdvancedConfig1700000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('amc_contracts', 'machine_groups'))) {
      await queryRunner.addColumn('amc_contracts', new TableColumn({ name: 'machine_groups', type: 'text', isNullable: true }));
    }
    if (!(await queryRunner.hasColumn('amc_contracts', 'notification_settings'))) {
      await queryRunner.addColumn('amc_contracts', new TableColumn({ name: 'notification_settings', type: 'text', isNullable: true }));
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('amc_contracts', 'notification_settings');
    await queryRunner.dropColumn('amc_contracts', 'machine_groups');
  }
}
