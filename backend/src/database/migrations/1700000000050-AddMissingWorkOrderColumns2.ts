import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingWorkOrderColumns21700000000050 implements MigrationInterface {
  name = 'AddMissingWorkOrderColumns21700000000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const missingColumns: Array<{ name: string; definition: string }> = [];

    const existing = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'work_orders'`,
    );
    const existingNames = new Set(existing.map((r: any) => r.column_name));

    const columns = [
      { name: 'shift', definition: `character varying NULL` },
      { name: 'breakdown_type', definition: `character varying NULL` },
      { name: 'initial_assessment', definition: `text NULL` },
      { name: 'expected_completion_at', definition: `timestamp without time zone NULL` },
      { name: 'work_permit_required', definition: `boolean NOT NULL DEFAULT false` },
      { name: 'loto_required', definition: `boolean NOT NULL DEFAULT false` },
      { name: 'actual_failure_category', definition: `character varying NULL` },
      { name: 'why_why_analysis', definition: `text NULL` },
      { name: 'preventive_recommendation', definition: `text NULL` },
      { name: 'manpower_used', definition: `text NULL` },
      { name: 'parent_work_order_id', definition: `uuid NULL` },
    ];

    for (const col of columns) {
      if (!existingNames.has(col.name)) {
        await queryRunner.query(
          `ALTER TABLE "work_orders" ADD COLUMN "${col.name}" ${col.definition}`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Not reversible - columns are additive
  }
}
