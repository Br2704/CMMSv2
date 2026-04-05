import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class VisitorExperienceAndNavigation1700000000036 implements MigrationInterface {
  name = 'VisitorExperienceAndNavigation1700000000036';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private largeTextType(queryRunner: QueryRunner) {
    if (queryRunner.connection.options.type === 'mysql') return 'longtext';
    if (queryRunner.connection.options.type === 'mssql') return 'ntext';
    return 'text';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('gate_entries'))) {
      return;
    }

    const dateTimeType = this.dateTimeType(queryRunner);
    const textType = this.largeTextType(queryRunner);

    const gateEntryColumns: Array<[string, TableColumn]> = [
      [
        'person_to_meet_user_id',
        new TableColumn({
          name: 'person_to_meet_user_id',
          type: 'uuid',
          isNullable: true,
        }),
      ],
      [
        'approval_status',
        new TableColumn({
          name: 'approval_status',
          type: 'varchar',
          default: "'NOT_REQUIRED'",
        }),
      ],
      [
        'approval_requested_at',
        new TableColumn({
          name: 'approval_requested_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'approval_responded_at',
        new TableColumn({
          name: 'approval_responded_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'approval_by',
        new TableColumn({
          name: 'approval_by',
          type: 'uuid',
          isNullable: true,
        }),
      ],
      [
        'approval_comments',
        new TableColumn({
          name: 'approval_comments',
          type: textType,
          isNullable: true,
        }),
      ],
      [
        'navigation_enabled',
        new TableColumn({
          name: 'navigation_enabled',
          type: 'boolean',
          default: false,
        }),
      ],
      [
        'navigation_enabled_at',
        new TableColumn({
          name: 'navigation_enabled_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'desired_visit_at',
        new TableColumn({
          name: 'desired_visit_at',
          type: dateTimeType,
          isNullable: true,
        }),
      ],
      [
        'current_location_node_id',
        new TableColumn({
          name: 'current_location_node_id',
          type: 'varchar',
          isNullable: true,
        }),
      ],
      [
        'current_location_label',
        new TableColumn({
          name: 'current_location_label',
          type: 'varchar',
          isNullable: true,
        }),
      ],
    ];

    for (const [name, column] of gateEntryColumns) {
      if (!(await queryRunner.hasColumn('gate_entries', name))) {
        await queryRunner.addColumn('gate_entries', column);
      }
    }

    const gateEntriesTable = await queryRunner.getTable('gate_entries');
    if (gateEntriesTable) {
      const gateEntryForeignKeys: Array<[string, string]> = [
        ['person_to_meet_user_id', 'fk_gate_entries_person_to_meet_user'],
        ['approval_by', 'fk_gate_entries_approval_by_user'],
      ];

      for (const [columnName, keyName] of gateEntryForeignKeys) {
        const existingKey = gateEntriesTable.foreignKeys.find((key) => key.name === keyName || key.columnNames.includes(columnName));
        if (existingKey) continue;
        await queryRunner.createForeignKey(
          'gate_entries',
          new TableForeignKey({
            name: keyName,
            columnNames: [columnName],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        );
      }
    }

    if (!(await queryRunner.hasTable('visitor_experience_content'))) {
      await queryRunner.createTable(
        new Table({
          name: 'visitor_experience_content',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: queryRunner.connection.options.type === 'mssql' ? 'NEWID()' : 'uuid_generate_v4()' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'page_title', type: 'varchar', default: "'Welcome to JK Fenner'" },
            { name: 'company_overview', type: textType, isNullable: true },
            { name: 'contact_name', type: 'varchar', isNullable: true },
            { name: 'contact_email', type: 'varchar', isNullable: true },
            { name: 'contact_phone', type: 'varchar', isNullable: true },
            { name: 'contact_address', type: textType, isNullable: true },
            { name: 'hero_highlights', type: textType, isNullable: true },
            { name: 'products', type: textType, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createForeignKey(
        'visitor_experience_content',
        new TableForeignKey({
          name: 'fk_visitor_experience_content_plant',
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createForeignKey(
        'visitor_experience_content',
        new TableForeignKey({
          name: 'fk_visitor_experience_content_created_by',
          columnNames: ['created_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }

    if (!(await queryRunner.hasTable('plant_layouts'))) {
      await queryRunner.createTable(
        new Table({
          name: 'plant_layouts',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: queryRunner.connection.options.type === 'mssql' ? 'NEWID()' : 'uuid_generate_v4()' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'layout_name', type: 'varchar', default: "'Plant Layout'" },
            { name: 'version', type: 'integer', default: 1 },
            { name: 'svg_markup', type: textType, isNullable: true },
            { name: 'map_data', type: textType, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'published_at', type: dateTimeType, isNullable: true },
            { name: 'created_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createForeignKey(
        'plant_layouts',
        new TableForeignKey({
          name: 'fk_plant_layouts_plant',
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'plant_layouts',
        new TableForeignKey({
          name: 'fk_plant_layouts_created_by',
          columnNames: ['created_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createIndex(
        'plant_layouts',
        new TableIndex({
          name: 'idx_plant_layouts_plant_active',
          columnNames: ['plant_id', 'is_active'],
        }),
      );
    }

    if (!(await queryRunner.hasTable('visitor_navigation_logs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'visitor_navigation_logs',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: queryRunner.connection.options.type === 'mssql' ? 'NEWID()' : 'uuid_generate_v4()' },
            { name: 'gate_entry_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'node_id', type: 'varchar', isNullable: true },
            { name: 'node_label', type: 'varchar', isNullable: true },
            { name: 'latitude', type: 'decimal', precision: 10, scale: 7, isNullable: true },
            { name: 'longitude', type: 'decimal', precision: 10, scale: 7, isNullable: true },
            { name: 'check_in_mode', type: 'varchar', default: "'MANUAL'" },
            { name: 'occurred_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'recorded_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createForeignKey(
        'visitor_navigation_logs',
        new TableForeignKey({
          name: 'fk_visitor_navigation_logs_gate_entry',
          columnNames: ['gate_entry_id'],
          referencedTableName: 'gate_entries',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'visitor_navigation_logs',
        new TableForeignKey({
          name: 'fk_visitor_navigation_logs_plant',
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createForeignKey(
        'visitor_navigation_logs',
        new TableForeignKey({
          name: 'fk_visitor_navigation_logs_recorded_by',
          columnNames: ['recorded_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createIndex(
        'visitor_navigation_logs',
        new TableIndex({
          name: 'idx_visitor_navigation_logs_gate_entry',
          columnNames: ['gate_entry_id', 'occurred_at'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('visitor_navigation_logs')) {
      const table = await queryRunner.getTable('visitor_navigation_logs');
      if (table) {
        for (const keyName of [
          'fk_visitor_navigation_logs_gate_entry',
          'fk_visitor_navigation_logs_plant',
          'fk_visitor_navigation_logs_recorded_by',
        ]) {
          const key = table.foreignKeys.find((foreignKey) => foreignKey.name === keyName);
          if (key) {
            await queryRunner.dropForeignKey('visitor_navigation_logs', key);
          }
        }
        const idx = table.indices.find((index) => index.name === 'idx_visitor_navigation_logs_gate_entry');
        if (idx) {
          await queryRunner.dropIndex('visitor_navigation_logs', idx);
        }
      }
      await queryRunner.dropTable('visitor_navigation_logs');
    }

    if (await queryRunner.hasTable('plant_layouts')) {
      const table = await queryRunner.getTable('plant_layouts');
      if (table) {
        for (const keyName of ['fk_plant_layouts_plant', 'fk_plant_layouts_created_by']) {
          const key = table.foreignKeys.find((foreignKey) => foreignKey.name === keyName);
          if (key) {
            await queryRunner.dropForeignKey('plant_layouts', key);
          }
        }
        const idx = table.indices.find((index) => index.name === 'idx_plant_layouts_plant_active');
        if (idx) {
          await queryRunner.dropIndex('plant_layouts', idx);
        }
      }
      await queryRunner.dropTable('plant_layouts');
    }

    if (await queryRunner.hasTable('visitor_experience_content')) {
      const table = await queryRunner.getTable('visitor_experience_content');
      if (table) {
        for (const keyName of ['fk_visitor_experience_content_plant', 'fk_visitor_experience_content_created_by']) {
          const key = table.foreignKeys.find((foreignKey) => foreignKey.name === keyName);
          if (key) {
            await queryRunner.dropForeignKey('visitor_experience_content', key);
          }
        }
      }
      await queryRunner.dropTable('visitor_experience_content');
    }

    if (await queryRunner.hasTable('gate_entries')) {
      const table = await queryRunner.getTable('gate_entries');
      if (table) {
        for (const keyName of ['fk_gate_entries_person_to_meet_user', 'fk_gate_entries_approval_by_user']) {
          const key = table.foreignKeys.find((foreignKey) => foreignKey.name === keyName);
          if (key) {
            await queryRunner.dropForeignKey('gate_entries', key);
          }
        }
      }

      for (const columnName of [
        'current_location_label',
        'current_location_node_id',
        'desired_visit_at',
        'navigation_enabled_at',
        'navigation_enabled',
        'approval_comments',
        'approval_by',
        'approval_responded_at',
        'approval_requested_at',
        'approval_status',
        'person_to_meet_user_id',
      ]) {
        if (await queryRunner.hasColumn('gate_entries', columnName)) {
          await queryRunner.dropColumn('gate_entries', columnName);
        }
      }
    }
  }
}
