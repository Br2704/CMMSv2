import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEsgWorkbookTracking1700000000024 implements MigrationInterface {
  name = 'AddEsgWorkbookTracking1700000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_daily_entries (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        entry_date date NOT NULL,
        year int NOT NULL,
        month int NOT NULL,
        metric_code varchar NOT NULL,
        metric_label varchar NOT NULL,
        category varchar NOT NULL,
        unit varchar NULL,
        value decimal(18,6) NOT NULL DEFAULT 0,
        notes varchar NULL,
        created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_esg_daily_entries_plant_date_metric UNIQUE (plant_id, entry_date, metric_code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_monthly_summaries (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        month int NOT NULL,
        metric_code varchar NOT NULL,
        metric_label varchar NOT NULL,
        category varchar NOT NULL,
        unit varchar NULL,
        value decimal(18,6) NOT NULL DEFAULT 0,
        value_source varchar NOT NULL DEFAULT 'DAILY',
        CONSTRAINT uq_esg_monthly_summaries_plant_period_metric UNIQUE (plant_id, year, month, metric_code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_plant_target_entries (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        metric_code varchar NOT NULL,
        metric_label varchar NOT NULL,
        category varchar NOT NULL,
        unit varchar NULL,
        target_value decimal(18,6) NOT NULL DEFAULT 0,
        notes varchar NULL,
        CONSTRAINT uq_esg_plant_target_entries_scope UNIQUE (plant_id, year, metric_code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_organization_target_entries (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        year int NOT NULL,
        metric_code varchar NOT NULL,
        metric_label varchar NOT NULL,
        category varchar NOT NULL,
        unit varchar NULL,
        target_value decimal(18,6) NOT NULL DEFAULT 0,
        notes varchar NULL,
        CONSTRAINT uq_esg_organization_target_entries_scope UNIQUE (organization_id, year, metric_code)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS esg_organization_target_entries');
    await queryRunner.query('DROP TABLE IF EXISTS esg_plant_target_entries');
    await queryRunner.query('DROP TABLE IF EXISTS esg_monthly_summaries');
    await queryRunner.query('DROP TABLE IF EXISTS esg_daily_entries');
  }
}
