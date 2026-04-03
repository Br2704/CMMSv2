import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class GateRealtimeAndEsgSync1700000000032 implements MigrationInterface {
  name = 'GateRealtimeAndEsgSync1700000000032';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private async ensureColumn(queryRunner: QueryRunner, tableName: string, column: TableColumn) {
    if (!(await queryRunner.hasTable(tableName))) {
      return;
    }
    if (await queryRunner.hasColumn(tableName, column.name)) {
      return;
    }
    await queryRunner.addColumn(tableName, column);
  }

  private async ensureForeignKey(queryRunner: QueryRunner, tableName: string, foreignKey: TableForeignKey) {
    const table = await queryRunner.getTable(tableName);
    if (!table) {
      return;
    }
    if (table.foreignKeys.some((item) => item.name === foreignKey.name)) {
      return;
    }
    await queryRunner.createForeignKey(tableName, foreignKey);
  }

  private async dropForeignKeyIfExists(queryRunner: QueryRunner, tableName: string, foreignKeyName: string) {
    const table = await queryRunner.getTable(tableName);
    const fk = table?.foreignKeys.find((item) => item.name === foreignKeyName);
    if (!fk) {
      return;
    }
    await queryRunner.dropForeignKey(tableName, fk);
  }

  private async ensureIndex(queryRunner: QueryRunner, tableName: string, index: TableIndex) {
    const table = await queryRunner.getTable(tableName);
    if (!table) {
      return;
    }
    if (table.indices.some((item) => item.name === index.name)) {
      return;
    }
    await queryRunner.createIndex(tableName, index);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureColumn(
      queryRunner,
      'gates',
      new TableColumn({ name: 'security_user_ids', type: 'text', isNullable: true }),
    );

    if (!(await queryRunner.hasTable('gate_entry_types'))) {
      await queryRunner.createTable(
        new Table({
          name: 'gate_entry_types',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true },
            { name: 'gate_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'template_name', type: 'varchar' },
            { name: 'visitor_type', type: 'varchar' },
            { name: 'department_id', type: 'uuid', isNullable: true },
            { name: 'module_id', type: 'uuid', isNullable: true },
            { name: 'machine_id', type: 'uuid', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_types',
      new TableForeignKey({
        name: 'fk_gate_entry_types_gate_id',
        columnNames: ['gate_id'],
        referencedTableName: 'gates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_types',
      new TableForeignKey({
        name: 'fk_gate_entry_types_plant_id',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_types',
      new TableForeignKey({
        name: 'fk_gate_entry_types_department_id',
        columnNames: ['department_id'],
        referencedTableName: 'departments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_types',
      new TableForeignKey({
        name: 'fk_gate_entry_types_module_id',
        columnNames: ['module_id'],
        referencedTableName: 'machine_modules',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_types',
      new TableForeignKey({
        name: 'fk_gate_entry_types_machine_id',
        columnNames: ['machine_id'],
        referencedTableName: 'assets',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_types',
      new TableForeignKey({
        name: 'fk_gate_entry_types_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureIndex(
      queryRunner,
      'gate_entry_types',
      new TableIndex({
        name: 'idx_gate_entry_types_scope',
        columnNames: ['plant_id', 'gate_id', 'visitor_type', 'is_active'],
      }),
    );

    if (await queryRunner.hasTable('gate_entry_templates')) {
      await queryRunner.query(`
        INSERT INTO gate_entry_types (
          id, gate_id, plant_id, template_name, visitor_type, department_id, module_id, machine_id, is_active, created_by, created_at, updated_at
        )
        SELECT
          t.id, t.gate_id, t.plant_id, t.template_name, t.visitor_type, t.department_id, t.module_id, t.machine_id, t.is_active, t.created_by, t.created_at, t.updated_at
        FROM gate_entry_templates t
        WHERE NOT EXISTS (
          SELECT 1 FROM gate_entry_types current_types WHERE current_types.id = t.id
        )
      `);
    }

    for (const column of [
      new TableColumn({ name: 'field_group', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'capture_key', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'help_text', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'default_value', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'is_environmental', type: 'boolean', default: false }),
    ]) {
      await this.ensureColumn(queryRunner, 'gate_template_fields', column);
    }

    await this.dropForeignKeyIfExists(queryRunner, 'gate_template_fields', 'fk_gate_template_fields_template_id');
    await this.ensureForeignKey(
      queryRunner,
      'gate_template_fields',
      new TableForeignKey({
        name: 'fk_gate_template_fields_template_id',
        columnNames: ['template_id'],
        referencedTableName: 'gate_entry_types',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await this.dropForeignKeyIfExists(queryRunner, 'gate_entries', 'fk_gate_entries_template_id');
    await this.ensureForeignKey(
      queryRunner,
      'gate_entries',
      new TableForeignKey({
        name: 'fk_gate_entries_template_id',
        columnNames: ['template_id'],
        referencedTableName: 'gate_entry_types',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    for (const column of [
      new TableColumn({ name: 'driver_contact', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'vehicle_type', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'fuel_type', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'engine_type', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'transport_distance_km', type: 'decimal', precision: 12, scale: 3, isNullable: true }),
      new TableColumn({ name: 'transport_mode', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'load_weight', type: 'decimal', precision: 12, scale: 3, isNullable: true }),
      new TableColumn({ name: 'unload_weight', type: 'decimal', precision: 12, scale: 3, isNullable: true }),
      new TableColumn({ name: 'idle_time_minutes', type: 'decimal', precision: 12, scale: 3, isNullable: true }),
      new TableColumn({ name: 'waste_type', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'waste_quantity', type: 'decimal', precision: 12, scale: 3, isNullable: true }),
      new TableColumn({ name: 'emission_category', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'estimated_co2e_kg', type: 'decimal', precision: 14, scale: 6, isNullable: true }),
    ]) {
      await this.ensureColumn(queryRunner, 'gate_vehicle_entries', column);
    }

    await this.dropForeignKeyIfExists(queryRunner, 'gate_vehicle_entries', 'fk_gate_vehicle_entries_template_id');
    await this.ensureForeignKey(
      queryRunner,
      'gate_vehicle_entries',
      new TableForeignKey({
        name: 'fk_gate_vehicle_entries_template_id',
        columnNames: ['template_id'],
        referencedTableName: 'gate_entry_types',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    if (!(await queryRunner.hasTable('gate_material_entries'))) {
      await queryRunner.createTable(
        new Table({
          name: 'gate_material_entries',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'gate_entry_id', type: 'uuid', isNullable: true },
            { name: 'gate_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'entry_type_id', type: 'uuid', isNullable: true },
            { name: 'material_name', type: 'varchar', isNullable: true },
            { name: 'material_category', type: 'varchar', isNullable: true },
            { name: 'quantity', type: 'decimal', precision: 12, scale: 3, isNullable: true },
            { name: 'unit_of_measurement', type: 'varchar', isNullable: true },
            { name: 'vendor', type: 'varchar', isNullable: true },
            { name: 'purchase_order_number', type: 'varchar', isNullable: true },
            { name: 'gate_pass_number', type: 'varchar', isNullable: true },
            { name: 'invoice_number', type: 'varchar', isNullable: true },
            { name: 'hazard_category', type: 'varchar', isNullable: true },
            { name: 'transport_mode', type: 'varchar', isNullable: true },
            { name: 'transport_distance_km', type: 'decimal', precision: 12, scale: 3, isNullable: true },
            { name: 'emission_category', type: 'varchar', isNullable: true },
            { name: 'estimated_co2e_kg', type: 'decimal', precision: 14, scale: 6, isNullable: true },
            { name: 'entry_time', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.ensureForeignKey(
      queryRunner,
      'gate_material_entries',
      new TableForeignKey({
        name: 'fk_gate_material_entries_gate_entry_id',
        columnNames: ['gate_entry_id'],
        referencedTableName: 'gate_entries',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_material_entries',
      new TableForeignKey({
        name: 'fk_gate_material_entries_gate_id',
        columnNames: ['gate_id'],
        referencedTableName: 'gates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_material_entries',
      new TableForeignKey({
        name: 'fk_gate_material_entries_plant_id',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_material_entries',
      new TableForeignKey({
        name: 'fk_gate_material_entries_entry_type_id',
        columnNames: ['entry_type_id'],
        referencedTableName: 'gate_entry_types',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureIndex(
      queryRunner,
      'gate_material_entries',
      new TableIndex({
        name: 'idx_gate_material_entries_scope',
        columnNames: ['plant_id', 'entry_type_id', 'entry_time'],
      }),
    );

    if (!(await queryRunner.hasTable('ghg_transport_logs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'ghg_transport_logs',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'gate_entry_id', type: 'uuid', isNullable: true },
            { name: 'gate_id', type: 'uuid', isNullable: true },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'entry_type_id', type: 'uuid', isNullable: true },
            { name: 'source_kind', type: 'varchar', isNullable: true },
            { name: 'fuel_type', type: 'varchar', isNullable: true },
            { name: 'engine_type', type: 'varchar', isNullable: true },
            { name: 'transport_mode', type: 'varchar', isNullable: true },
            { name: 'distance_km', type: 'decimal', precision: 12, scale: 3, isNullable: true },
            { name: 'idle_time_minutes', type: 'decimal', precision: 12, scale: 3, isNullable: true },
            { name: 'material_weight_kg', type: 'decimal', precision: 12, scale: 3, isNullable: true },
            { name: 'waste_quantity_kg', type: 'decimal', precision: 12, scale: 3, isNullable: true },
            { name: 'emission_category', type: 'varchar', isNullable: true },
            { name: 'scope_category', type: 'varchar', default: "'SCOPE_3'" },
            { name: 'computed_co2e_kg', type: 'decimal', precision: 14, scale: 6, default: 0 },
            { name: 'metadata', type: 'text', isNullable: true },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.ensureForeignKey(
      queryRunner,
      'ghg_transport_logs',
      new TableForeignKey({
        name: 'fk_ghg_transport_logs_gate_entry_id',
        columnNames: ['gate_entry_id'],
        referencedTableName: 'gate_entries',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'ghg_transport_logs',
      new TableForeignKey({
        name: 'fk_ghg_transport_logs_gate_id',
        columnNames: ['gate_id'],
        referencedTableName: 'gates',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'ghg_transport_logs',
      new TableForeignKey({
        name: 'fk_ghg_transport_logs_plant_id',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'ghg_transport_logs',
      new TableForeignKey({
        name: 'fk_ghg_transport_logs_entry_type_id',
        columnNames: ['entry_type_id'],
        referencedTableName: 'gate_entry_types',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureIndex(
      queryRunner,
      'ghg_transport_logs',
      new TableIndex({
        name: 'idx_ghg_transport_logs_scope',
        columnNames: ['plant_id', 'entry_type_id', 'scope_category'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['ghg_transport_logs', 'gate_material_entries']) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }
      const table = await queryRunner.getTable(tableName);
      for (const fk of table?.foreignKeys ?? []) {
        await queryRunner.dropForeignKey(tableName, fk);
      }
      for (const index of table?.indices ?? []) {
        await queryRunner.dropIndex(tableName, index);
      }
      await queryRunner.dropTable(tableName);
    }

    if (await queryRunner.hasTable('gate_vehicle_entries')) {
      for (const columnName of [
        'estimated_co2e_kg',
        'emission_category',
        'waste_quantity',
        'waste_type',
        'idle_time_minutes',
        'unload_weight',
        'load_weight',
        'transport_mode',
        'transport_distance_km',
        'engine_type',
        'fuel_type',
        'vehicle_type',
        'driver_contact',
      ]) {
        if (await queryRunner.hasColumn('gate_vehicle_entries', columnName)) {
          await queryRunner.dropColumn('gate_vehicle_entries', columnName);
        }
      }
    }

    if (await queryRunner.hasTable('gate_template_fields')) {
      for (const columnName of ['is_environmental', 'default_value', 'help_text', 'capture_key', 'field_group']) {
        if (await queryRunner.hasColumn('gate_template_fields', columnName)) {
          await queryRunner.dropColumn('gate_template_fields', columnName);
        }
      }
    }

    if (await queryRunner.hasColumn('gates', 'security_user_ids')) {
      await queryRunner.dropColumn('gates', 'security_user_ids');
    }
  }
}
