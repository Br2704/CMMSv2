import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaintenanceReports1700000000051 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "maintenance_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "work_order_id" uuid NOT NULL,
        "wo_number" character varying NOT NULL,
        "asset_id" uuid NOT NULL,
        "asset_code" character varying NOT NULL,
        "asset_name" character varying NOT NULL,
        "asset_category" character varying,
        "plant_id" uuid NOT NULL,
        "plant_name" character varying NOT NULL,
        "department_id" uuid,
        "department_name" character varying,
        "area" character varying,
        "line" character varying,
        "raised_by" uuid,
        "raised_by_name" character varying,
        "assigned_to" uuid,
        "assigned_to_name" character varying,
        "approved_by" uuid,
        "approved_by_name" character varying,
        "closure_date" TIMESTAMP NOT NULL,
        "issue_title" character varying,
        "problem_description" text,
        "actual_failure_category" character varying,
        "failure_code" character varying,
        "root_cause" text,
        "sub_root_cause" character varying,
        "operator_fault" boolean NOT NULL DEFAULT false,
        "repeat_failure" boolean NOT NULL DEFAULT false,
        "amc_covered" boolean NOT NULL DEFAULT false,
        "breakdown_type" character varying,
        "initial_assessment" text,
        "actual_corrective_action" text,
        "preventive_recommendation" text,
        "follow_up_required" boolean NOT NULL DEFAULT false,
        "follow_up_team_id" uuid,
        "follow_up_status" character varying,
        "why_why_analysis" jsonb,
        "technician_remarks" text,
        "closure_remarks" text,
        "start_time" TIMESTAMP,
        "response_time" integer NOT NULL DEFAULT 0,
        "open_time" integer NOT NULL DEFAULT 0,
        "completion_time" TIMESTAMP,
        "approval_time" TIMESTAMP,
        "total_downtime" integer NOT NULL DEFAULT 0,
        "actual_repair_time" integer NOT NULL DEFAULT 0,
        "waiting_time" integer NOT NULL DEFAULT 0,
        "manpower_used" text,
        "manpower_count" integer NOT NULL DEFAULT 0,
        "spare_consumption" jsonb,
        "total_spare_cost" numeric(12,2) NOT NULL DEFAULT 0,
        "outside_vendor_involved" boolean NOT NULL DEFAULT false,
        "attachments" jsonb,
        CONSTRAINT "PK_maintenance_reports_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_maintenance_reports_plant_id" ON "maintenance_reports" ("plant_id");
      CREATE INDEX "IDX_maintenance_reports_asset_id" ON "maintenance_reports" ("asset_id");
      CREATE INDEX "IDX_maintenance_reports_work_order_id" ON "maintenance_reports" ("work_order_id");
      CREATE INDEX "IDX_maintenance_reports_closure_date" ON "maintenance_reports" ("closure_date");
    `);

    await queryRunner.query(`
      ALTER TABLE "maintenance_reports" ADD CONSTRAINT "FK_maintenance_reports_work_order" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
      ALTER TABLE "maintenance_reports" ADD CONSTRAINT "FK_maintenance_reports_asset" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
      ALTER TABLE "maintenance_reports" ADD CONSTRAINT "FK_maintenance_reports_plant" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
      ALTER TABLE "maintenance_reports" ADD CONSTRAINT "FK_maintenance_reports_follow_up_team" FOREIGN KEY ("follow_up_team_id") REFERENCES "maintenance_teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "maintenance_reports" DROP CONSTRAINT "FK_maintenance_reports_follow_up_team"`);
    await queryRunner.query(`ALTER TABLE "maintenance_reports" DROP CONSTRAINT "FK_maintenance_reports_plant"`);
    await queryRunner.query(`ALTER TABLE "maintenance_reports" DROP CONSTRAINT "FK_maintenance_reports_asset"`);
    await queryRunner.query(`ALTER TABLE "maintenance_reports" DROP CONSTRAINT "FK_maintenance_reports_work_order"`);
    await queryRunner.query(`DROP TABLE "maintenance_reports"`);
  }
}
