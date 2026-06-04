import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserMappings1780482349265 implements MigrationInterface {
    name = 'AddUserMappings1780482349265'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_plant_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "plant_id" uuid, CONSTRAINT "UQ_628ff66d89b5de1f0c46a07d4fd" UNIQUE ("user_id", "plant_id"), CONSTRAINT "PK_ff866b685c1e92170743c987af2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_department_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "department_id" uuid, CONSTRAINT "UQ_cc0ef86088bedb6edd7514a349c" UNIQUE ("user_id", "department_id"), CONSTRAINT "PK_89651edee63b2d9fde5009b499b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_module_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "module_id" uuid, CONSTRAINT "UQ_4c2948551f0721747f1eb4e44ef" UNIQUE ("user_id", "module_id"), CONSTRAINT "PK_1207c85d5adfdefb7c8e2a06836" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_machine_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "asset_id" uuid, CONSTRAINT "UQ_0ec78d546974abd85b18c5a699a" UNIQUE ("user_id", "asset_id"), CONSTRAINT "PK_9af3b912813f223b095f941021b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_shift_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "shift_id" uuid, CONSTRAINT "UQ_43131d4ad728fa0191b2f977ee6" UNIQUE ("user_id", "shift_id"), CONSTRAINT "PK_cdbc87a222431ced2650a5846d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user_plant_mappings" ADD CONSTRAINT "FK_e67cd016268bb53622c2ce68813" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_plant_mappings" ADD CONSTRAINT "FK_c13acc908a529691392d4a5a87c" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_department_mappings" ADD CONSTRAINT "FK_652ddbbbe61501ccda42bd5f731" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_department_mappings" ADD CONSTRAINT "FK_d6239f8af2f3c0e58b68ecdfe7c" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_module_mappings" ADD CONSTRAINT "FK_adce6801f5921fe5ca4e377a09c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_module_mappings" ADD CONSTRAINT "FK_ab665fb8ab22fe572efbd6c832b" FOREIGN KEY ("module_id") REFERENCES "machine_modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_machine_mappings" ADD CONSTRAINT "FK_43744fa21446ebb00b27cae5dbd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_machine_mappings" ADD CONSTRAINT "FK_9cfe8cabc5f3738c77967c30662" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_shift_mappings" ADD CONSTRAINT "FK_8c0e416397ee0f8728af4b9f952" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_shift_mappings" ADD CONSTRAINT "FK_5ac14c048c58d97f82ea2c7bd99" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        
        // Insert new enterprise roles into 'roles' table if they don't exist
        await queryRunner.query(`
            INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
            SELECT uuid_generate_v4(), 'Maintenance Technician', 'Execution-level role — accesses only Work Orders, Assets, and Logs. Cannot access masters or reports.', now(), now()
            WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'Maintenance Technician')
        `);

        await queryRunner.query(`
            INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
            SELECT uuid_generate_v4(), 'Production Operator', 'Execution-level role — accesses only Work Orders, Assets, and Logs. Cannot access masters or reports.', now(), now()
            WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'Production Operator')
        `);

        // Insert new enterprise roles into 'org_roles' for all existing organizations
        await queryRunner.query(`
            INSERT INTO "org_roles" ("id", "organization_id", "key", "name", "is_active", "is_system", "created_at", "updated_at")
            SELECT uuid_generate_v4(), id, 'MAINTENANCE_TECHNICIAN', 'Maintenance Technician', true, true, now(), now()
            FROM "organizations"
            WHERE NOT EXISTS (SELECT 1 FROM "org_roles" WHERE "key" = 'MAINTENANCE_TECHNICIAN' AND "organization_id" = "organizations"."id")
        `);

        await queryRunner.query(`
            INSERT INTO "org_roles" ("id", "organization_id", "key", "name", "is_active", "is_system", "created_at", "updated_at")
            SELECT uuid_generate_v4(), id, 'PRODUCTION_OPERATOR', 'Production Operator', true, true, now(), now()
            FROM "organizations"
            WHERE NOT EXISTS (SELECT 1 FROM "org_roles" WHERE "key" = 'PRODUCTION_OPERATOR' AND "organization_id" = "organizations"."id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_shift_mappings" DROP CONSTRAINT "FK_5ac14c048c58d97f82ea2c7bd99"`);
        await queryRunner.query(`ALTER TABLE "user_shift_mappings" DROP CONSTRAINT "FK_8c0e416397ee0f8728af4b9f952"`);
        await queryRunner.query(`ALTER TABLE "user_machine_mappings" DROP CONSTRAINT "FK_9cfe8cabc5f3738c77967c30662"`);
        await queryRunner.query(`ALTER TABLE "user_machine_mappings" DROP CONSTRAINT "FK_43744fa21446ebb00b27cae5dbd"`);
        await queryRunner.query(`ALTER TABLE "user_module_mappings" DROP CONSTRAINT "FK_ab665fb8ab22fe572efbd6c832b"`);
        await queryRunner.query(`ALTER TABLE "user_module_mappings" DROP CONSTRAINT "FK_adce6801f5921fe5ca4e377a09c"`);
        await queryRunner.query(`ALTER TABLE "user_department_mappings" DROP CONSTRAINT "FK_d6239f8af2f3c0e58b68ecdfe7c"`);
        await queryRunner.query(`ALTER TABLE "user_department_mappings" DROP CONSTRAINT "FK_652ddbbbe61501ccda42bd5f731"`);
        await queryRunner.query(`ALTER TABLE "user_plant_mappings" DROP CONSTRAINT "FK_c13acc908a529691392d4a5a87c"`);
        await queryRunner.query(`ALTER TABLE "user_plant_mappings" DROP CONSTRAINT "FK_e67cd016268bb53622c2ce68813"`);
        await queryRunner.query(`DROP TABLE "user_shift_mappings"`);
        await queryRunner.query(`DROP TABLE "user_machine_mappings"`);
        await queryRunner.query(`DROP TABLE "user_module_mappings"`);
        await queryRunner.query(`DROP TABLE "user_department_mappings"`);
        await queryRunner.query(`DROP TABLE "user_plant_mappings"`);
    }

}
