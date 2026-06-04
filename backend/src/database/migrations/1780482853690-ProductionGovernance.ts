import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductionGovernance1780482853690 implements MigrationInterface {
    name = 'ProductionGovernance1780482853690'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "pending_executions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "execution_type" character varying NOT NULL, "reference_id" uuid, "payload" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING_L1', "submitted_by" uuid NOT NULL, "level_1_approver" uuid, "level_2_approver" uuid, "level_1_approved_at" TIMESTAMP, "level_2_approved_at" TIMESTAMP, "comments" text, CONSTRAINT "PK_45434fd680b72f380b023f909dc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "shift_handovers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "plant_id" uuid NOT NULL, "department_id" uuid, "shift_id" uuid NOT NULL, "pending_wo_count" integer NOT NULL DEFAULT '0', "pending_pm_count" integer NOT NULL DEFAULT '0', "pending_pd_count" integer NOT NULL DEFAULT '0', "pending_logs_count" integer NOT NULL DEFAULT '0', "machine_status_summary" jsonb, "follow_up_actions" text, "handed_over_by" uuid NOT NULL, "received_by" uuid, "status" character varying NOT NULL DEFAULT 'PENDING_RECEIPT', CONSTRAINT "PK_8cdb8cc438e93da01fa54623ebe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "pending_executions" ADD CONSTRAINT "FK_430a703fa8c260bc1e5342aab4f" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "pending_executions" ADD CONSTRAINT "FK_be99b93f7e0baa5a0a2ca186035" FOREIGN KEY ("level_1_approver") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "pending_executions" ADD CONSTRAINT "FK_fb2073e05ac1227cd429c42bc55" FOREIGN KEY ("level_2_approver") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" ADD CONSTRAINT "FK_9be79b2be4914dd575eb450d3ff" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" ADD CONSTRAINT "FK_40348c5857fa5943bf360dd7cb6" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" ADD CONSTRAINT "FK_53803c5fc1a7deb92b763e7d57b" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" ADD CONSTRAINT "FK_a76adcb49d4af307a4eb981b7d9" FOREIGN KEY ("handed_over_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" ADD CONSTRAINT "FK_196d6665a150154729739082dba" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shift_handovers" DROP CONSTRAINT "FK_196d6665a150154729739082dba"`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" DROP CONSTRAINT "FK_a76adcb49d4af307a4eb981b7d9"`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" DROP CONSTRAINT "FK_53803c5fc1a7deb92b763e7d57b"`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" DROP CONSTRAINT "FK_40348c5857fa5943bf360dd7cb6"`);
        await queryRunner.query(`ALTER TABLE "shift_handovers" DROP CONSTRAINT "FK_9be79b2be4914dd575eb450d3ff"`);
        await queryRunner.query(`ALTER TABLE "pending_executions" DROP CONSTRAINT "FK_fb2073e05ac1227cd429c42bc55"`);
        await queryRunner.query(`ALTER TABLE "pending_executions" DROP CONSTRAINT "FK_be99b93f7e0baa5a0a2ca186035"`);
        await queryRunner.query(`ALTER TABLE "pending_executions" DROP CONSTRAINT "FK_430a703fa8c260bc1e5342aab4f"`);
        await queryRunner.query(`DROP TABLE "shift_handovers"`);
        await queryRunner.query(`DROP TABLE "pending_executions"`);
    }

}
