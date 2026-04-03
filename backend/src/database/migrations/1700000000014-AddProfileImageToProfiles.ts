import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProfileImageToProfiles1700000000014 implements MigrationInterface {
  name = 'AddProfileImageToProfiles1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const profilesTable = await queryRunner.getTable('profiles');
    if (!profilesTable) {
      return;
    }

    const latest = await queryRunner.getTable('profiles');
    if (!latest?.columns.some((column) => column.name === 'profile_image_url')) {
      await queryRunner.addColumn(
        'profiles',
        new TableColumn({
          name: 'profile_image_url',
          type: 'text',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const profilesTable = await queryRunner.getTable('profiles');
    if (!profilesTable?.columns.some((column) => column.name === 'profile_image_url')) {
      return;
    }

    await queryRunner.dropColumn('profiles', 'profile_image_url');
  }
}
