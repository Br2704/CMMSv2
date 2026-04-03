import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class DigitalGateEntryFoundation1700000000031 implements MigrationInterface {
  name = 'DigitalGateEntryFoundation1700000000031';

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
      new TableColumn({
        name: 'gate_type',
        type: 'varchar',
        default: "'MAIN_GATE'",
      }),
    );

    await this.ensureIndex(
      queryRunner,
      'gates',
      new TableIndex({
        name: 'idx_gates_plant_type_active',
        columnNames: ['plant_id', 'gate_type', 'is_active'],
      }),
    );

    if (!(await queryRunner.hasTable('gate_entry_templates'))) {
      await queryRunner.createTable(
        new Table({
          name: 'gate_entry_templates',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
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
      'gate_entry_templates',
      new TableForeignKey({
        name: 'fk_gate_entry_templates_gate_id',
        columnNames: ['gate_id'],
        referencedTableName: 'gates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_templates',
      new TableForeignKey({
        name: 'fk_gate_entry_templates_plant_id',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_templates',
      new TableForeignKey({
        name: 'fk_gate_entry_templates_department_id',
        columnNames: ['department_id'],
        referencedTableName: 'departments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_templates',
      new TableForeignKey({
        name: 'fk_gate_entry_templates_module_id',
        columnNames: ['module_id'],
        referencedTableName: 'machine_modules',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_templates',
      new TableForeignKey({
        name: 'fk_gate_entry_templates_machine_id',
        columnNames: ['machine_id'],
        referencedTableName: 'assets',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entry_templates',
      new TableForeignKey({
        name: 'fk_gate_entry_templates_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.ensureIndex(
      queryRunner,
      'gate_entry_templates',
      new TableIndex({
        name: 'idx_gate_entry_templates_scope',
        columnNames: ['plant_id', 'gate_id', 'visitor_type', 'is_active'],
      }),
    );

    if (!(await queryRunner.hasTable('gate_template_fields'))) {
      await queryRunner.createTable(
        new Table({
          name: 'gate_template_fields',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'template_id', type: 'uuid' },
            { name: 'field_name', type: 'varchar' },
            { name: 'field_label', type: 'varchar' },
            { name: 'field_type', type: 'varchar', default: "'TEXT'" },
            { name: 'options', type: 'text', isNullable: true },
            { name: 'is_required', type: 'boolean', default: false },
            { name: 'unit', type: 'varchar', isNullable: true },
            { name: 'allowed_min', type: 'decimal', precision: 12, scale: 2, isNullable: true },
            { name: 'allowed_max', type: 'decimal', precision: 12, scale: 2, isNullable: true },
            { name: 'placeholder', type: 'varchar', isNullable: true },
            { name: 'display_order', type: 'int', default: 0 },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.ensureForeignKey(
      queryRunner,
      'gate_template_fields',
      new TableForeignKey({
        name: 'fk_gate_template_fields_template_id',
        columnNames: ['template_id'],
        referencedTableName: 'gate_entry_templates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await this.ensureIndex(
      queryRunner,
      'gate_template_fields',
      new TableIndex({
        name: 'idx_gate_template_fields_template_order',
        columnNames: ['template_id', 'display_order'],
      }),
    );

    const gateEntryColumns = [
      new TableColumn({ name: 'template_id', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'department_id', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'module_id', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'machine_id', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'vendor_name', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'material_description', type: 'text', isNullable: true }),
      new TableColumn({ name: 'quantity', type: 'decimal', precision: 12, scale: 2, isNullable: true }),
      new TableColumn({ name: 'gate_pass_number', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'invoice_number', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'entry_data', type: 'text', isNullable: true }),
      new TableColumn({ name: 'qr_code_value', type: 'varchar', isNullable: true, isUnique: true }),
      new TableColumn({ name: 'duplicate_detected', type: 'boolean', default: false }),
      new TableColumn({ name: 'blacklist_alert', type: 'boolean', default: false }),
      new TableColumn({ name: 'watchlist_alert', type: 'boolean', default: false }),
      new TableColumn({ name: 'exit_approved_by', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'exit_remarks', type: 'text', isNullable: true }),
    ];

    for (const column of gateEntryColumns) {
      await this.ensureColumn(queryRunner, 'gate_entries', column);
    }

    await this.ensureForeignKey(
      queryRunner,
      'gate_entries',
      new TableForeignKey({
        name: 'fk_gate_entries_template_id',
        columnNames: ['template_id'],
        referencedTableName: 'gate_entry_templates',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entries',
      new TableForeignKey({
        name: 'fk_gate_entries_department_id',
        columnNames: ['department_id'],
        referencedTableName: 'departments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entries',
      new TableForeignKey({
        name: 'fk_gate_entries_module_id',
        columnNames: ['module_id'],
        referencedTableName: 'machine_modules',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entries',
      new TableForeignKey({
        name: 'fk_gate_entries_machine_id',
        columnNames: ['machine_id'],
        referencedTableName: 'assets',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_entries',
      new TableForeignKey({
        name: 'fk_gate_entries_exit_approved_by',
        columnNames: ['exit_approved_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.ensureIndex(
      queryRunner,
      'gate_entries',
      new TableIndex({
        name: 'idx_gate_entries_scope_status',
        columnNames: ['plant_id', 'gate_id', 'status', 'entry_time'],
      }),
    );
    await this.ensureIndex(
      queryRunner,
      'gate_entries',
      new TableIndex({
        name: 'idx_gate_entries_search',
        columnNames: ['visitor_name', 'visitor_type', 'vehicle_number'],
      }),
    );

    if (!(await queryRunner.hasTable('gate_vehicle_entries'))) {
      await queryRunner.createTable(
        new Table({
          name: 'gate_vehicle_entries',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'gate_entry_id', type: 'uuid', isNullable: true },
            { name: 'gate_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'template_id', type: 'uuid', isNullable: true },
            { name: 'movement_type', type: 'varchar', default: "'VEHICLE_ENTRY'" },
            { name: 'vehicle_number', type: 'varchar', isNullable: true },
            { name: 'driver_name', type: 'varchar', isNullable: true },
            { name: 'vendor_name', type: 'varchar', isNullable: true },
            { name: 'material_description', type: 'text', isNullable: true },
            { name: 'quantity', type: 'decimal', precision: 12, scale: 2, isNullable: true },
            { name: 'gate_pass_number', type: 'varchar', isNullable: true },
            { name: 'invoice_number', type: 'varchar', isNullable: true },
            { name: 'remarks', type: 'text', isNullable: true },
            { name: 'entry_time', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.ensureForeignKey(
      queryRunner,
      'gate_vehicle_entries',
      new TableForeignKey({
        name: 'fk_gate_vehicle_entries_gate_entry_id',
        columnNames: ['gate_entry_id'],
        referencedTableName: 'gate_entries',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_vehicle_entries',
      new TableForeignKey({
        name: 'fk_gate_vehicle_entries_gate_id',
        columnNames: ['gate_id'],
        referencedTableName: 'gates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_vehicle_entries',
      new TableForeignKey({
        name: 'fk_gate_vehicle_entries_plant_id',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_vehicle_entries',
      new TableForeignKey({
        name: 'fk_gate_vehicle_entries_template_id',
        columnNames: ['template_id'],
        referencedTableName: 'gate_entry_templates',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.ensureIndex(
      queryRunner,
      'gate_vehicle_entries',
      new TableIndex({
        name: 'idx_gate_vehicle_entries_scope',
        columnNames: ['plant_id', 'movement_type', 'entry_time'],
      }),
    );

    if (!(await queryRunner.hasTable('gate_exit_logs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'gate_exit_logs',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'gate_entry_id', type: 'uuid' },
            { name: 'gate_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'exit_time', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'exit_method', type: 'varchar', default: "'MANUAL'" },
            { name: 'exit_approved_by', type: 'uuid', isNullable: true },
            { name: 'remarks', type: 'text', isNullable: true },
            { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.ensureForeignKey(
      queryRunner,
      'gate_exit_logs',
      new TableForeignKey({
        name: 'fk_gate_exit_logs_gate_entry_id',
        columnNames: ['gate_entry_id'],
        referencedTableName: 'gate_entries',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_exit_logs',
      new TableForeignKey({
        name: 'fk_gate_exit_logs_gate_id',
        columnNames: ['gate_id'],
        referencedTableName: 'gates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_exit_logs',
      new TableForeignKey({
        name: 'fk_gate_exit_logs_plant_id',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.ensureForeignKey(
      queryRunner,
      'gate_exit_logs',
      new TableForeignKey({
        name: 'fk_gate_exit_logs_exit_approved_by',
        columnNames: ['exit_approved_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.ensureIndex(
      queryRunner,
      'gate_exit_logs',
      new TableIndex({
        name: 'idx_gate_exit_logs_scope',
        columnNames: ['plant_id', 'gate_id', 'exit_time'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const gateExitIndexes = ['idx_gate_exit_logs_scope'];
    if (await queryRunner.hasTable('gate_exit_logs')) {
      const table = await queryRunner.getTable('gate_exit_logs');
      for (const indexName of gateExitIndexes) {
        const index = table?.indices.find((item) => item.name === indexName);
        if (index) {
          await queryRunner.dropIndex('gate_exit_logs', index);
        }
      }
      for (const fkName of [
        'fk_gate_exit_logs_exit_approved_by',
        'fk_gate_exit_logs_plant_id',
        'fk_gate_exit_logs_gate_id',
        'fk_gate_exit_logs_gate_entry_id',
      ]) {
        const current = await queryRunner.getTable('gate_exit_logs');
        const fk = current?.foreignKeys.find((item) => item.name === fkName);
        if (fk) {
          await queryRunner.dropForeignKey('gate_exit_logs', fk);
        }
      }
      await queryRunner.dropTable('gate_exit_logs');
    }

    if (await queryRunner.hasTable('gate_vehicle_entries')) {
      const table = await queryRunner.getTable('gate_vehicle_entries');
      const index = table?.indices.find((item) => item.name === 'idx_gate_vehicle_entries_scope');
      if (index) {
        await queryRunner.dropIndex('gate_vehicle_entries', index);
      }
      for (const fkName of [
        'fk_gate_vehicle_entries_template_id',
        'fk_gate_vehicle_entries_plant_id',
        'fk_gate_vehicle_entries_gate_id',
        'fk_gate_vehicle_entries_gate_entry_id',
      ]) {
        const current = await queryRunner.getTable('gate_vehicle_entries');
        const fk = current?.foreignKeys.find((item) => item.name === fkName);
        if (fk) {
          await queryRunner.dropForeignKey('gate_vehicle_entries', fk);
        }
      }
      await queryRunner.dropTable('gate_vehicle_entries');
    }

    if (await queryRunner.hasTable('gate_entries')) {
      const table = await queryRunner.getTable('gate_entries');
      for (const indexName of ['idx_gate_entries_scope_status', 'idx_gate_entries_search']) {
        const index = table?.indices.find((item) => item.name === indexName);
        if (index) {
          await queryRunner.dropIndex('gate_entries', index);
        }
      }
      for (const fkName of [
        'fk_gate_entries_exit_approved_by',
        'fk_gate_entries_machine_id',
        'fk_gate_entries_module_id',
        'fk_gate_entries_department_id',
        'fk_gate_entries_template_id',
      ]) {
        const current = await queryRunner.getTable('gate_entries');
        const fk = current?.foreignKeys.find((item) => item.name === fkName);
        if (fk) {
          await queryRunner.dropForeignKey('gate_entries', fk);
        }
      }
      for (const columnName of [
        'exit_remarks',
        'exit_approved_by',
        'watchlist_alert',
        'blacklist_alert',
        'duplicate_detected',
        'qr_code_value',
        'entry_data',
        'invoice_number',
        'gate_pass_number',
        'quantity',
        'material_description',
        'vendor_name',
        'machine_id',
        'module_id',
        'department_id',
        'template_id',
      ]) {
        if (await queryRunner.hasColumn('gate_entries', columnName)) {
          await queryRunner.dropColumn('gate_entries', columnName);
        }
      }
    }

    if (await queryRunner.hasTable('gate_template_fields')) {
      const table = await queryRunner.getTable('gate_template_fields');
      const index = table?.indices.find((item) => item.name === 'idx_gate_template_fields_template_order');
      if (index) {
        await queryRunner.dropIndex('gate_template_fields', index);
      }
      const fk = table?.foreignKeys.find((item) => item.name === 'fk_gate_template_fields_template_id');
      if (fk) {
        await queryRunner.dropForeignKey('gate_template_fields', fk);
      }
      await queryRunner.dropTable('gate_template_fields');
    }

    if (await queryRunner.hasTable('gate_entry_templates')) {
      const table = await queryRunner.getTable('gate_entry_templates');
      const index = table?.indices.find((item) => item.name === 'idx_gate_entry_templates_scope');
      if (index) {
        await queryRunner.dropIndex('gate_entry_templates', index);
      }
      for (const fkName of [
        'fk_gate_entry_templates_created_by',
        'fk_gate_entry_templates_machine_id',
        'fk_gate_entry_templates_module_id',
        'fk_gate_entry_templates_department_id',
        'fk_gate_entry_templates_plant_id',
        'fk_gate_entry_templates_gate_id',
      ]) {
        const current = await queryRunner.getTable('gate_entry_templates');
        const fk = current?.foreignKeys.find((item) => item.name === fkName);
        if (fk) {
          await queryRunner.dropForeignKey('gate_entry_templates', fk);
        }
      }
      await queryRunner.dropTable('gate_entry_templates');
    }

    if (await queryRunner.hasTable('gates')) {
      const table = await queryRunner.getTable('gates');
      const index = table?.indices.find((item) => item.name === 'idx_gates_plant_type_active');
      if (index) {
        await queryRunner.dropIndex('gates', index);
      }
      if (await queryRunner.hasColumn('gates', 'gate_type')) {
        await queryRunner.dropColumn('gates', 'gate_type');
      }
    }
  }
}
