import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class SmartVisitorMappingAndSession1700000000037 implements MigrationInterface {
  name = 'SmartVisitorMappingAndSession1700000000037';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private largeTextType(queryRunner: QueryRunner) {
    if (queryRunner.connection.options.type === 'mysql') return 'longtext';
    if (queryRunner.connection.options.type === 'mssql') return 'ntext';
    return 'text';
  }

  private uuidDefault(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'NEWID()' : 'uuid_generate_v4()';
  }

  private async createForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    key: TableForeignKey,
  ) {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    const existing = table.foreignKeys.find((foreignKey) => foreignKey.name === key.name);
    if (existing) return;
    await queryRunner.createForeignKey(tableName, key);
  }

  private async createIndexIfMissing(queryRunner: QueryRunner, tableName: string, index: TableIndex) {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    const existing = table.indices.find((item) => item.name === index.name);
    if (existing) return;
    await queryRunner.createIndex(tableName, index);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('gate_entries'))) {
      return;
    }

    const dateTimeType = this.dateTimeType(queryRunner);
    const textType = this.largeTextType(queryRunner);
    const uuidDefault = this.uuidDefault(queryRunner);

    const gateEntryColumns: Array<[string, TableColumn]> = [
      [
        'allowed_visit_start_at',
        new TableColumn({
          name: 'allowed_visit_start_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'allowed_visit_end_at',
        new TableColumn({
          name: 'allowed_visit_end_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'visitor_user_id',
        new TableColumn({
          name: 'visitor_user_id',
          type: 'uuid',
          isNullable: true,
        }),
      ],
    ];

    for (const [name, column] of gateEntryColumns) {
      if (!(await queryRunner.hasColumn('gate_entries', name))) {
        await queryRunner.addColumn('gate_entries', column);
      }
    }

    await this.createForeignKeyIfMissing(
      queryRunner,
      'gate_entries',
      new TableForeignKey({
        name: 'fk_gate_entries_visitor_user',
        columnNames: ['visitor_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.createIndexIfMissing(
      queryRunner,
      'gate_entries',
      new TableIndex({
        name: 'idx_gate_entries_visit_window',
        columnNames: ['plant_id', 'allowed_visit_end_at', 'status'],
      }),
    );

    if (!(await queryRunner.hasTable('plant_coordinates'))) {
      await queryRunner.createTable(
        new Table({
          name: 'plant_coordinates',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: uuidDefault },
            { name: 'plant_id', type: 'uuid' },
            { name: 'gate_id', type: 'uuid', isNullable: true },
            { name: 'department_id', type: 'uuid', isNullable: true },
            { name: 'module_id', type: 'uuid', isNullable: true },
            { name: 'location_name', type: 'varchar' },
            { name: 'location_type', type: 'varchar', default: "'KEY_LOCATION'" },
            { name: 'latitude', type: 'decimal', precision: 10, scale: 7 },
            { name: 'longitude', type: 'decimal', precision: 10, scale: 7 },
            { name: 'boundary_points', type: textType, isNullable: true },
            { name: 'meta', type: textType, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.createForeignKeyIfMissing(
      queryRunner,
      'plant_coordinates',
      new TableForeignKey({
        name: 'fk_plant_coordinates_plant',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'plant_coordinates',
      new TableForeignKey({
        name: 'fk_plant_coordinates_gate',
        columnNames: ['gate_id'],
        referencedTableName: 'gates',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'plant_coordinates',
      new TableForeignKey({
        name: 'fk_plant_coordinates_department',
        columnNames: ['department_id'],
        referencedTableName: 'departments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'plant_coordinates',
      new TableForeignKey({
        name: 'fk_plant_coordinates_module',
        columnNames: ['module_id'],
        referencedTableName: 'machine_modules',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'plant_coordinates',
      new TableForeignKey({
        name: 'fk_plant_coordinates_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.createIndexIfMissing(
      queryRunner,
      'plant_coordinates',
      new TableIndex({
        name: 'idx_plant_coordinates_plant_active',
        columnNames: ['plant_id', 'is_active'],
      }),
    );

    if (!(await queryRunner.hasTable('pathways'))) {
      await queryRunner.createTable(
        new Table({
          name: 'pathways',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: uuidDefault },
            { name: 'plant_id', type: 'uuid' },
            { name: 'pathway_name', type: 'varchar' },
            { name: 'path_type', type: 'varchar', default: "'WALKABLE'" },
            { name: 'start_coordinate_id', type: 'uuid', isNullable: true },
            { name: 'end_coordinate_id', type: 'uuid', isNullable: true },
            { name: 'corner_points', type: textType, isNullable: true },
            { name: 'route_meta', type: textType, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.createForeignKeyIfMissing(
      queryRunner,
      'pathways',
      new TableForeignKey({
        name: 'fk_pathways_plant',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'pathways',
      new TableForeignKey({
        name: 'fk_pathways_start_coordinate',
        columnNames: ['start_coordinate_id'],
        referencedTableName: 'plant_coordinates',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'pathways',
      new TableForeignKey({
        name: 'fk_pathways_end_coordinate',
        columnNames: ['end_coordinate_id'],
        referencedTableName: 'plant_coordinates',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'pathways',
      new TableForeignKey({
        name: 'fk_pathways_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.createIndexIfMissing(
      queryRunner,
      'pathways',
      new TableIndex({
        name: 'idx_pathways_plant_active',
        columnNames: ['plant_id', 'is_active', 'path_type'],
      }),
    );

    if (!(await queryRunner.hasTable('geo_fences'))) {
      await queryRunner.createTable(
        new Table({
          name: 'geo_fences',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: uuidDefault },
            { name: 'plant_id', type: 'uuid' },
            { name: 'fence_name', type: 'varchar' },
            { name: 'fence_type', type: 'varchar', default: "'ALLOWED'" },
            { name: 'polygon_points', type: textType },
            { name: 'alert_on_violation', type: 'boolean', default: true },
            { name: 'active_from', type: dateTimeType, isNullable: true },
            { name: 'active_to', type: dateTimeType, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.createForeignKeyIfMissing(
      queryRunner,
      'geo_fences',
      new TableForeignKey({
        name: 'fk_geo_fences_plant',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'geo_fences',
      new TableForeignKey({
        name: 'fk_geo_fences_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.createIndexIfMissing(
      queryRunner,
      'geo_fences',
      new TableIndex({
        name: 'idx_geo_fences_plant_active',
        columnNames: ['plant_id', 'is_active', 'fence_type'],
      }),
    );

    if (!(await queryRunner.hasTable('visitor_sessions'))) {
      await queryRunner.createTable(
        new Table({
          name: 'visitor_sessions',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: uuidDefault },
            { name: 'gate_entry_id', type: 'uuid' },
            { name: 'visitor_user_id', type: 'uuid', isNullable: true },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'session_token', type: 'varchar', isUnique: true },
            { name: 'mobile_number', type: 'varchar', isNullable: true },
            { name: 'start_time', type: dateTimeType },
            { name: 'end_time', type: dateTimeType },
            { name: 'status', type: 'varchar', default: "'PENDING'" },
            { name: 'approval_status', type: 'varchar', default: "'PENDING'" },
            { name: 'is_active', type: 'boolean', default: false },
            { name: 'approved_by', type: 'uuid', isNullable: true },
            { name: 'approved_at', type: dateTimeType, isNullable: true },
            { name: 'rejected_by', type: 'uuid', isNullable: true },
            { name: 'rejected_at', type: dateTimeType, isNullable: true },
            { name: 'last_latitude', type: 'decimal', precision: 10, scale: 7, isNullable: true },
            { name: 'last_longitude', type: 'decimal', precision: 10, scale: 7, isNullable: true },
            { name: 'last_node_id', type: 'varchar', isNullable: true },
            { name: 'last_node_label', type: 'varchar', isNullable: true },
            { name: 'last_seen_at', type: dateTimeType, isNullable: true },
            { name: 'notes', type: textType, isNullable: true },
            { name: 'created_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_sessions',
      new TableForeignKey({
        name: 'fk_visitor_sessions_gate_entry',
        columnNames: ['gate_entry_id'],
        referencedTableName: 'gate_entries',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_sessions',
      new TableForeignKey({
        name: 'fk_visitor_sessions_visitor_user',
        columnNames: ['visitor_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_sessions',
      new TableForeignKey({
        name: 'fk_visitor_sessions_plant',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_sessions',
      new TableForeignKey({
        name: 'fk_visitor_sessions_approved_by',
        columnNames: ['approved_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_sessions',
      new TableForeignKey({
        name: 'fk_visitor_sessions_rejected_by',
        columnNames: ['rejected_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_sessions',
      new TableForeignKey({
        name: 'fk_visitor_sessions_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.createIndexIfMissing(
      queryRunner,
      'visitor_sessions',
      new TableIndex({
        name: 'idx_visitor_sessions_gate_entry',
        columnNames: ['gate_entry_id'],
        isUnique: true,
      }),
    );
    await this.createIndexIfMissing(
      queryRunner,
      'visitor_sessions',
      new TableIndex({
        name: 'idx_visitor_sessions_plant_status',
        columnNames: ['plant_id', 'status', 'is_active'],
      }),
    );

    if (!(await queryRunner.hasTable('visitor_tracking'))) {
      await queryRunner.createTable(
        new Table({
          name: 'visitor_tracking',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: uuidDefault },
            { name: 'visitor_session_id', type: 'uuid' },
            { name: 'gate_entry_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'latitude', type: 'decimal', precision: 10, scale: 7, isNullable: true },
            { name: 'longitude', type: 'decimal', precision: 10, scale: 7, isNullable: true },
            { name: 'node_id', type: 'varchar', isNullable: true },
            { name: 'node_label', type: 'varchar', isNullable: true },
            { name: 'geo_fence_status', type: 'varchar', default: "'WITHIN'" },
            { name: 'alert_type', type: 'varchar', isNullable: true },
            { name: 'route_deviation', type: 'boolean', default: false },
            { name: 'source', type: 'varchar', default: "'GPS'" },
            { name: 'payload', type: textType, isNullable: true },
            { name: 'tracked_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'recorded_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
    }

    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_tracking',
      new TableForeignKey({
        name: 'fk_visitor_tracking_session',
        columnNames: ['visitor_session_id'],
        referencedTableName: 'visitor_sessions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_tracking',
      new TableForeignKey({
        name: 'fk_visitor_tracking_gate_entry',
        columnNames: ['gate_entry_id'],
        referencedTableName: 'gate_entries',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_tracking',
      new TableForeignKey({
        name: 'fk_visitor_tracking_plant',
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await this.createForeignKeyIfMissing(
      queryRunner,
      'visitor_tracking',
      new TableForeignKey({
        name: 'fk_visitor_tracking_recorded_by',
        columnNames: ['recorded_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await this.createIndexIfMissing(
      queryRunner,
      'visitor_tracking',
      new TableIndex({
        name: 'idx_visitor_tracking_session_time',
        columnNames: ['visitor_session_id', 'tracked_at'],
      }),
    );
    await this.createIndexIfMissing(
      queryRunner,
      'visitor_tracking',
      new TableIndex({
        name: 'idx_visitor_tracking_gate_entry_time',
        columnNames: ['gate_entry_id', 'tracked_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('visitor_tracking')) {
      const table = await queryRunner.getTable('visitor_tracking');
      if (table) {
        for (const keyName of [
          'fk_visitor_tracking_session',
          'fk_visitor_tracking_gate_entry',
          'fk_visitor_tracking_plant',
          'fk_visitor_tracking_recorded_by',
        ]) {
          const key = table.foreignKeys.find((item) => item.name === keyName);
          if (key) await queryRunner.dropForeignKey('visitor_tracking', key);
        }
        for (const indexName of ['idx_visitor_tracking_session_time', 'idx_visitor_tracking_gate_entry_time']) {
          const index = table.indices.find((item) => item.name === indexName);
          if (index) await queryRunner.dropIndex('visitor_tracking', index);
        }
      }
      await queryRunner.dropTable('visitor_tracking');
    }

    if (await queryRunner.hasTable('visitor_sessions')) {
      const table = await queryRunner.getTable('visitor_sessions');
      if (table) {
        for (const keyName of [
          'fk_visitor_sessions_gate_entry',
          'fk_visitor_sessions_visitor_user',
          'fk_visitor_sessions_plant',
          'fk_visitor_sessions_approved_by',
          'fk_visitor_sessions_rejected_by',
          'fk_visitor_sessions_created_by',
        ]) {
          const key = table.foreignKeys.find((item) => item.name === keyName);
          if (key) await queryRunner.dropForeignKey('visitor_sessions', key);
        }
        for (const indexName of ['idx_visitor_sessions_gate_entry', 'idx_visitor_sessions_plant_status']) {
          const index = table.indices.find((item) => item.name === indexName);
          if (index) await queryRunner.dropIndex('visitor_sessions', index);
        }
      }
      await queryRunner.dropTable('visitor_sessions');
    }

    if (await queryRunner.hasTable('geo_fences')) {
      const table = await queryRunner.getTable('geo_fences');
      if (table) {
        for (const keyName of ['fk_geo_fences_plant', 'fk_geo_fences_created_by']) {
          const key = table.foreignKeys.find((item) => item.name === keyName);
          if (key) await queryRunner.dropForeignKey('geo_fences', key);
        }
        const index = table.indices.find((item) => item.name === 'idx_geo_fences_plant_active');
        if (index) await queryRunner.dropIndex('geo_fences', index);
      }
      await queryRunner.dropTable('geo_fences');
    }

    if (await queryRunner.hasTable('pathways')) {
      const table = await queryRunner.getTable('pathways');
      if (table) {
        for (const keyName of [
          'fk_pathways_plant',
          'fk_pathways_start_coordinate',
          'fk_pathways_end_coordinate',
          'fk_pathways_created_by',
        ]) {
          const key = table.foreignKeys.find((item) => item.name === keyName);
          if (key) await queryRunner.dropForeignKey('pathways', key);
        }
        const index = table.indices.find((item) => item.name === 'idx_pathways_plant_active');
        if (index) await queryRunner.dropIndex('pathways', index);
      }
      await queryRunner.dropTable('pathways');
    }

    if (await queryRunner.hasTable('plant_coordinates')) {
      const table = await queryRunner.getTable('plant_coordinates');
      if (table) {
        for (const keyName of [
          'fk_plant_coordinates_plant',
          'fk_plant_coordinates_gate',
          'fk_plant_coordinates_department',
          'fk_plant_coordinates_module',
          'fk_plant_coordinates_created_by',
        ]) {
          const key = table.foreignKeys.find((item) => item.name === keyName);
          if (key) await queryRunner.dropForeignKey('plant_coordinates', key);
        }
        const index = table.indices.find((item) => item.name === 'idx_plant_coordinates_plant_active');
        if (index) await queryRunner.dropIndex('plant_coordinates', index);
      }
      await queryRunner.dropTable('plant_coordinates');
    }

    if (await queryRunner.hasTable('gate_entries')) {
      const table = await queryRunner.getTable('gate_entries');
      if (table) {
        const fk = table.foreignKeys.find((item) => item.name === 'fk_gate_entries_visitor_user');
        if (fk) await queryRunner.dropForeignKey('gate_entries', fk);
        const index = table.indices.find((item) => item.name === 'idx_gate_entries_visit_window');
        if (index) await queryRunner.dropIndex('gate_entries', index);
      }

      for (const columnName of ['visitor_user_id', 'allowed_visit_end_at', 'allowed_visit_start_at']) {
        if (await queryRunner.hasColumn('gate_entries', columnName)) {
          await queryRunner.dropColumn('gate_entries', columnName);
        }
      }
    }
  }
}
