import { MigrationInterface, QueryRunner } from "typeorm";

export class MakerCheckerWorkflow1780482676578 implements MigrationInterface {
    name = 'MakerCheckerWorkflow1780482676578'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "change_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "module_type" character varying NOT NULL, "action_type" character varying NOT NULL, "reference_id" uuid, "payload" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING_L1', "submitted_by" uuid NOT NULL, "level_1_approver" uuid, "level_2_approver" uuid, "level_1_approved_at" TIMESTAMP, "level_2_approved_at" TIMESTAMP, "comments" text, "version_number" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_e3f28255a6e818820f18f6d5956" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "record_revisions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "module_type" character varying NOT NULL, "reference_id" uuid NOT NULL, "version_number" integer NOT NULL, "payload" jsonb NOT NULL, "changed_by" uuid, "change_request_id" uuid, CONSTRAINT "PK_70f13d3b239de8df41a5c2e7185" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "pm_templates" ADD "version_number" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "calibration_templates" ADD "version_number" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "log_templates" ADD "version_number" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "change_requests" ADD CONSTRAINT "FK_bebc884e7a03ea96c6526710e27" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "change_requests" ADD CONSTRAINT "FK_7e12a26b8badbb2194161a8b243" FOREIGN KEY ("level_1_approver") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "change_requests" ADD CONSTRAINT "FK_94c4062e11ad9af47b2a70f0e9d" FOREIGN KEY ("level_2_approver") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "record_revisions" ADD CONSTRAINT "FK_1008823d73c4bd0a16948200f69" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "record_revisions" ADD CONSTRAINT "FK_b0e17b8dbaf1983d3806927d434" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "record_revisions" DROP CONSTRAINT "FK_b0e17b8dbaf1983d3806927d434"`);
        await queryRunner.query(`ALTER TABLE "record_revisions" DROP CONSTRAINT "FK_1008823d73c4bd0a16948200f69"`);
        await queryRunner.query(`ALTER TABLE "change_requests" DROP CONSTRAINT "FK_94c4062e11ad9af47b2a70f0e9d"`);
        await queryRunner.query(`ALTER TABLE "change_requests" DROP CONSTRAINT "FK_7e12a26b8badbb2194161a8b243"`);
        await queryRunner.query(`ALTER TABLE "change_requests" DROP CONSTRAINT "FK_bebc884e7a03ea96c6526710e27"`);
        await queryRunner.query(`ALTER TABLE "log_templates" DROP COLUMN "version_number"`);
        await queryRunner.query(`ALTER TABLE "calibration_templates" DROP COLUMN "version_number"`);
        await queryRunner.query(`ALTER TABLE "pm_templates" DROP COLUMN "version_number"`);
        await queryRunner.query(`DROP TABLE "record_revisions"`);
        await queryRunner.query(`DROP TABLE "change_requests"`);
    }

}
