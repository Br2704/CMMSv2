import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoSchema1780548089980 implements MigrationInterface {
    name = 'AutoSchema1780548089980'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_278a4591a818bacf071499c7a2d"`);
        await queryRunner.query(`DROP INDEX "public"."idx_notifications_user_unread"`);
        await queryRunner.query(`CREATE TABLE "failure_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "plant_id" uuid NOT NULL, "department_id" uuid, "module_id" uuid, "asset_id" uuid, "category" character varying NOT NULL, "code" character varying NOT NULL, "description" character varying, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_58ad08dcaf0c061f2672d08a1bd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "rcas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "wo_id" uuid NOT NULL, "asset_id" uuid NOT NULL, "problem_statement" text NOT NULL, "why_1" text NOT NULL, "why_2" text, "why_3" text, "why_4" text, "why_5" text, "root_cause" text NOT NULL, "corrective_action" text NOT NULL, "preventive_action" text NOT NULL, "evidence_urls" text, "status" character varying NOT NULL DEFAULT 'DRAFT', "submitted_by" uuid, "approved_by" uuid, "approval_comments" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_9bdfb12ad025954407386c84352" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "group_key"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "category"`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "plant_id" uuid`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "reference_id" uuid`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "status" character varying NOT NULL DEFAULT 'OPEN'`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "remarks" text`);
        await queryRunner.query(`ALTER TABLE "assets" ALTER COLUMN "criticality" SET DEFAULT 'B Medium'`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_38894ef355cf8c9f2b92afae06c" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "failure_codes" ADD CONSTRAINT "FK_b78961949930a978295ef053943" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "failure_codes" ADD CONSTRAINT "FK_2ebc511d1392be67e72cadf9428" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "failure_codes" ADD CONSTRAINT "FK_d6a12729fd00779d8d2372150e3" FOREIGN KEY ("module_id") REFERENCES "machine_modules"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "failure_codes" ADD CONSTRAINT "FK_fe70a96a4b8f63fe247c50afba2" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rcas" ADD CONSTRAINT "FK_036b69360eb1efdcd40fd41b6b0" FOREIGN KEY ("wo_id") REFERENCES "work_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rcas" ADD CONSTRAINT "FK_a7015c55aa8ee67735f6fe0a0b5" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rcas" ADD CONSTRAINT "FK_dbb853e56fbe162c329a8faf56c" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rcas" ADD CONSTRAINT "FK_9a827ca5ecf63c94dd938e2417d" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rcas" DROP CONSTRAINT "FK_9a827ca5ecf63c94dd938e2417d"`);
        await queryRunner.query(`ALTER TABLE "rcas" DROP CONSTRAINT "FK_dbb853e56fbe162c329a8faf56c"`);
        await queryRunner.query(`ALTER TABLE "rcas" DROP CONSTRAINT "FK_a7015c55aa8ee67735f6fe0a0b5"`);
        await queryRunner.query(`ALTER TABLE "rcas" DROP CONSTRAINT "FK_036b69360eb1efdcd40fd41b6b0"`);
        await queryRunner.query(`ALTER TABLE "failure_codes" DROP CONSTRAINT "FK_fe70a96a4b8f63fe247c50afba2"`);
        await queryRunner.query(`ALTER TABLE "failure_codes" DROP CONSTRAINT "FK_d6a12729fd00779d8d2372150e3"`);
        await queryRunner.query(`ALTER TABLE "failure_codes" DROP CONSTRAINT "FK_2ebc511d1392be67e72cadf9428"`);
        await queryRunner.query(`ALTER TABLE "failure_codes" DROP CONSTRAINT "FK_b78961949930a978295ef053943"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_38894ef355cf8c9f2b92afae06c"`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" SET DEFAULT 'info'`);
        await queryRunner.query(`ALTER TABLE "assets" ALTER COLUMN "criticality" SET DEFAULT 'MEDIUM'`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "remarks"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "reference_id"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "plant_id"`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "category" character varying`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "group_key" character varying`);
        await queryRunner.query(`DROP TABLE "rcas"`);
        await queryRunner.query(`DROP TABLE "failure_codes"`);
        await queryRunner.query(`CREATE INDEX "idx_notifications_user_unread" ON "notifications" ("user_id", "is_read") `);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_278a4591a818bacf071499c7a2d" FOREIGN KEY ("wo_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
