import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBackupProgressPercent1700000000060 implements MigrationInterface {
  name = 'AddBackupProgressPercent1700000000060';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'backup_history',
      new TableColumn({
        name: 'progressPercent',
        type: 'int',
        isNullable: false,
        default: 0,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('backup_history', 'progressPercent');
  }
}
