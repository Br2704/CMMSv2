import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultForWorkOrderActivityLogId1700000000041 implements MigrationInterface {
    name = 'AddDefaultForWorkOrderActivityLogId1700000000041';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const dbType = queryRunner.connection.options.type;
        if (dbType !== 'postgres') {
            return;
        }

        if (!(await queryRunner.hasTable('work_order_activity_logs'))) {
            return;
        }

        await queryRunner.query(
            `ALTER TABLE "work_order_activity_logs" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const dbType = queryRunner.connection.options.type;
        if (dbType !== 'postgres') {
            return;
        }

        if (!(await queryRunner.hasTable('work_order_activity_logs'))) {
            return;
        }

        await queryRunner.query(
            `ALTER TABLE "work_order_activity_logs" ALTER COLUMN "id" DROP DEFAULT`,
        );
    }
}
