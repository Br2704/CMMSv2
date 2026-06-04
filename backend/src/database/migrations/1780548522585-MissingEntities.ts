import { MigrationInterface, QueryRunner } from "typeorm";

export class MissingEntities1780548522585 implements MigrationInterface {
    name = 'MissingEntities1780548522585'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "warranty_alerts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "plant_id" uuid, "machine_id" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'OPEN', "remarks" character varying, "closed_by" uuid, "closed_at" TIMESTAMP, CONSTRAINT "PK_0bfede6decfae14033bde361c70" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "machine_failure_code_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "machine_id" uuid NOT NULL, "failure_category" character varying NOT NULL, "failure_code" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "requested_by" uuid, "approved_by" uuid, "approved_at" TIMESTAMP, CONSTRAINT "UQ_63b14ae98246cd9ca595b79f655" UNIQUE ("machine_id", "failure_category", "failure_code"), CONSTRAINT "PK_43fb5f67b32cd3c8cbceabafb6a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "warranty_alerts" ADD CONSTRAINT "FK_0f1f1e9a8ed23c325b86defdb52" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "warranty_alerts" ADD CONSTRAINT "FK_feaf6e8ee9e5ea74f48a3bb7fd2" FOREIGN KEY ("machine_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "warranty_alerts" ADD CONSTRAINT "FK_8fddccc6327616b771381189401" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "machine_failure_code_mappings" ADD CONSTRAINT "FK_421f5c0b9c9d62906e10bed372c" FOREIGN KEY ("machine_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "machine_failure_code_mappings" ADD CONSTRAINT "FK_750ca28ba76361c3fb9668de69e" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "machine_failure_code_mappings" ADD CONSTRAINT "FK_be1b656b4a9723e5e6e20b28f5a" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "machine_failure_code_mappings" DROP CONSTRAINT "FK_be1b656b4a9723e5e6e20b28f5a"`);
        await queryRunner.query(`ALTER TABLE "machine_failure_code_mappings" DROP CONSTRAINT "FK_750ca28ba76361c3fb9668de69e"`);
        await queryRunner.query(`ALTER TABLE "machine_failure_code_mappings" DROP CONSTRAINT "FK_421f5c0b9c9d62906e10bed372c"`);
        await queryRunner.query(`ALTER TABLE "warranty_alerts" DROP CONSTRAINT "FK_8fddccc6327616b771381189401"`);
        await queryRunner.query(`ALTER TABLE "warranty_alerts" DROP CONSTRAINT "FK_feaf6e8ee9e5ea74f48a3bb7fd2"`);
        await queryRunner.query(`ALTER TABLE "warranty_alerts" DROP CONSTRAINT "FK_0f1f1e9a8ed23c325b86defdb52"`);
        await queryRunner.query(`DROP TABLE "machine_failure_code_mappings"`);
        await queryRunner.query(`DROP TABLE "warranty_alerts"`);
    }

}
