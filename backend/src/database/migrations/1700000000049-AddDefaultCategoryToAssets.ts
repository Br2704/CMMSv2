import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultCategoryToAssets1700000000049 implements MigrationInterface {
  name = 'AddDefaultCategoryToAssets1700000000049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('assets', 'default_category');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "assets" ADD "default_category" character varying NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "default_category"`);
  }
}
