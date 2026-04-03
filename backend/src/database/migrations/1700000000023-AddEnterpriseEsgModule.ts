import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnterpriseEsgModule1700000000023 implements MigrationInterface {
  name = 'AddEnterpriseEsgModule1700000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_kpi_master (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        kpi_name varchar NOT NULL,
        kpi_category varchar NOT NULL,
        formula text NULL,
        unit varchar NULL,
        description text NULL,
        status varchar NOT NULL DEFAULT 'ACTIVE'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_targets (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        target_energy_reduction decimal(12,3) NULL,
        target_water_reduction decimal(12,3) NULL,
        target_emission_reduction decimal(12,3) NULL,
        target_waste_reduction decimal(12,3) NULL,
        renewable_target decimal(12,3) NULL,
        CONSTRAINT uq_esg_targets_plant_year UNIQUE (plant_id, year)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_emission_factors (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        energy_type varchar NOT NULL,
        unit varchar NOT NULL,
        co2_factor decimal(14,6) NOT NULL,
        source varchar NULL,
        effective_date date NOT NULL,
        is_active boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_authorized_users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        esg_category varchar NOT NULL,
        created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_esg_authorized_users_plant_category_user UNIQUE (plant_id, esg_category, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_energy_data (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        month int NOT NULL,
        grid_electricity_kwh decimal(14,3) NOT NULL DEFAULT 0,
        diesel_consumption_litre decimal(14,3) NOT NULL DEFAULT 0,
        coal_consumption decimal(14,3) NOT NULL DEFAULT 0,
        gas_consumption decimal(14,3) NOT NULL DEFAULT 0,
        steam_consumption decimal(14,3) NOT NULL DEFAULT 0,
        solar_generation decimal(14,3) NOT NULL DEFAULT 0,
        wind_generation decimal(14,3) NOT NULL DEFAULT 0,
        green_energy_purchase decimal(14,3) NOT NULL DEFAULT 0,
        total_energy decimal(14,3) NOT NULL DEFAULT 0,
        renewable_energy_percentage decimal(8,3) NOT NULL DEFAULT 0,
        energy_intensity decimal(14,6) NULL,
        is_locked boolean NOT NULL DEFAULT false,
        verified_at timestamp NULL,
        verified_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_esg_energy_data_plant_period UNIQUE (plant_id, year, month)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_water_data (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        month int NOT NULL,
        fresh_water_intake decimal(14,3) NOT NULL DEFAULT 0,
        ground_water decimal(14,3) NOT NULL DEFAULT 0,
        municipal_water decimal(14,3) NOT NULL DEFAULT 0,
        recycled_water decimal(14,3) NOT NULL DEFAULT 0,
        rain_water decimal(14,3) NOT NULL DEFAULT 0,
        water_discharge decimal(14,3) NOT NULL DEFAULT 0,
        total_water_consumption decimal(14,3) NOT NULL DEFAULT 0,
        water_intensity decimal(14,6) NULL,
        recycled_water_percentage decimal(8,3) NOT NULL DEFAULT 0,
        is_locked boolean NOT NULL DEFAULT false,
        verified_at timestamp NULL,
        verified_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_esg_water_data_plant_period UNIQUE (plant_id, year, month)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_emission_data (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        month int NOT NULL,
        scope1_emissions decimal(14,6) NOT NULL DEFAULT 0,
        scope2_emissions decimal(14,6) NOT NULL DEFAULT 0,
        scope3_emissions decimal(14,6) NOT NULL DEFAULT 0,
        boiler_nox decimal(14,6) NOT NULL DEFAULT 0,
        boiler_sox decimal(14,6) NOT NULL DEFAULT 0,
        boiler_pm decimal(14,6) NOT NULL DEFAULT 0,
        stack_emission decimal(14,6) NOT NULL DEFAULT 0,
        total_ghg_emissions decimal(14,6) NOT NULL DEFAULT 0,
        emission_intensity decimal(14,6) NULL,
        is_locked boolean NOT NULL DEFAULT false,
        verified_at timestamp NULL,
        verified_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_esg_emission_data_plant_period UNIQUE (plant_id, year, month)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_waste_data (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        month int NOT NULL,
        hazardous_waste decimal(14,3) NOT NULL DEFAULT 0,
        non_hazardous_waste decimal(14,3) NOT NULL DEFAULT 0,
        recycled_waste decimal(14,3) NOT NULL DEFAULT 0,
        landfill_waste decimal(14,3) NOT NULL DEFAULT 0,
        incinerated_waste decimal(14,3) NOT NULL DEFAULT 0,
        total_waste decimal(14,3) NOT NULL DEFAULT 0,
        recycling_rate decimal(8,3) NOT NULL DEFAULT 0,
        waste_intensity decimal(14,6) NULL,
        is_locked boolean NOT NULL DEFAULT false,
        verified_at timestamp NULL,
        verified_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_esg_waste_data_plant_period UNIQUE (plant_id, year, month)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_production_data (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        month int NOT NULL,
        production_quantity decimal(14,3) NOT NULL DEFAULT 0,
        operating_hours decimal(14,3) NOT NULL DEFAULT 0,
        machine_utilization decimal(8,3) NOT NULL DEFAULT 0,
        is_locked boolean NOT NULL DEFAULT false,
        verified_at timestamp NULL,
        verified_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_esg_production_data_plant_period UNIQUE (plant_id, year, month)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esg_kpi_results (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
        year int NOT NULL,
        month int NOT NULL,
        kpi_name varchar NOT NULL,
        kpi_category varchar NOT NULL,
        value decimal(18,6) NOT NULL DEFAULT 0,
        unit varchar NULL,
        target_value decimal(18,6) NULL,
        status varchar NOT NULL DEFAULT 'ON_TRACK',
        variance decimal(18,6) NULL,
        calculated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_esg_kpi_results_plant_period_name UNIQUE (plant_id, year, month, kpi_name)
      )
    `);

    await queryRunner.query(`
      INSERT INTO esg_kpi_master (id, kpi_name, kpi_category, formula, unit, description, status)
      SELECT uuid_generate_v4(), kpi_name, kpi_category, formula, unit, description, 'ACTIVE'
      FROM (
        VALUES
          ('Total Energy Consumption', 'Energy', 'grid_electricity_kwh + diesel_consumption_litre + coal_consumption + gas_consumption + steam_consumption + green_energy_purchase', 'kWh', 'Total energy used by the plant'),
          ('Energy Intensity', 'Energy', 'total_energy / production_quantity', 'kWh/unit', 'Energy use per unit of production'),
          ('Renewable Energy %', 'Renewables', '(solar_generation + wind_generation + green_energy_purchase) / total_energy * 100', '%', 'Renewable energy share'),
          ('Water Consumption', 'Water', 'fresh_water_intake + ground_water + municipal_water + recycled_water + rain_water', 'm3', 'Total water intake'),
          ('Water Intensity', 'Water', 'total_water_consumption / production_quantity', 'm3/unit', 'Water use per unit of production'),
          ('Total GHG Emissions', 'Emissions', 'scope1_emissions + scope2_emissions + scope3_emissions', 'tCO2e', 'Total greenhouse gas emissions'),
          ('Emission Intensity', 'Emissions', 'total_ghg_emissions / production_quantity', 'tCO2e/unit', 'Emissions per unit of production'),
          ('Waste Generated', 'Waste', 'hazardous_waste + non_hazardous_waste', 'kg', 'Total waste generated'),
          ('Waste Recycled %', 'Waste', 'recycled_waste / total_waste * 100', '%', 'Waste recycling rate')
      ) AS seed(kpi_name, kpi_category, formula, unit, description)
      WHERE NOT EXISTS (
        SELECT 1 FROM esg_kpi_master existing WHERE lower(existing.kpi_name) = lower(seed.kpi_name)
      )
    `);
    await queryRunner.query(`
      INSERT INTO esg_emission_factors (id, energy_type, unit, co2_factor, source, effective_date, is_active)
      SELECT uuid_generate_v4(), energy_type, unit, co2_factor, source, CURRENT_DATE, true
      FROM (
        VALUES
          ('Electricity', 'kWh', 0.000708, 'Default grid factor'),
          ('Diesel', 'litre', 0.002680, 'Default diesel factor'),
          ('Coal', 'kg', 0.002420, 'Default coal factor'),
          ('Gas', 'm3', 0.001900, 'Default gas factor'),
          ('Steam', 'kg', 0.000150, 'Default steam factor')
      ) AS seed(energy_type, unit, co2_factor, source)
      WHERE NOT EXISTS (
        SELECT 1 FROM esg_emission_factors existing WHERE lower(existing.energy_type) = lower(seed.energy_type)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS esg_kpi_results');
    await queryRunner.query('DROP TABLE IF EXISTS esg_production_data');
    await queryRunner.query('DROP TABLE IF EXISTS esg_waste_data');
    await queryRunner.query('DROP TABLE IF EXISTS esg_emission_data');
    await queryRunner.query('DROP TABLE IF EXISTS esg_water_data');
    await queryRunner.query('DROP TABLE IF EXISTS esg_energy_data');
    await queryRunner.query('DROP TABLE IF EXISTS esg_authorized_users');
    await queryRunner.query('DROP TABLE IF EXISTS esg_emission_factors');
    await queryRunner.query('DROP TABLE IF EXISTS esg_targets');
    await queryRunner.query('DROP TABLE IF EXISTS esg_kpi_master');
  }
}
