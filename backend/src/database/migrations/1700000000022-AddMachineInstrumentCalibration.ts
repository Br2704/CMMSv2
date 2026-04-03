import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableForeignKey } from 'typeorm';
import { DATETIME_COLUMN_TYPE, LARGE_TEXT_COLUMN_TYPE } from '../entities/common';

export class AddMachineInstrumentCalibration1700000000022 implements MigrationInterface {
  name = 'AddMachineInstrumentCalibration1700000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('machine_instruments'))) {
      await queryRunner.createTable(
        new Table({
          name: 'machine_instruments',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'asset_id', type: 'uuid' },
            { name: 'instrument_name', type: 'varchar' },
            { name: 'instrument_type', type: 'varchar' },
            { name: 'serial_number', type: 'varchar', isNullable: true },
            { name: 'range_min', type: 'decimal', precision: 18, scale: 3, isNullable: true },
            { name: 'range_max', type: 'decimal', precision: 18, scale: 3, isNullable: true },
            { name: 'unit', type: 'varchar', isNullable: true },
            { name: 'installation_date', type: 'date', isNullable: true },
            { name: 'status', type: 'varchar', default: "'ACTIVE'" },
            { name: 'created_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['asset_id'],
              referencedTableName: 'assets',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
          ],
          uniques: [{ name: 'uq_machine_instruments_asset_serial', columnNames: ['asset_id', 'serial_number'] }],
        }),
      );
    }

    if (!(await queryRunner.hasTable('calibration_templates'))) {
      await queryRunner.createTable(
        new Table({
          name: 'calibration_templates',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'template_name', type: 'varchar' },
            { name: 'instrument_type', type: 'varchar' },
            { name: 'calibration_method', type: 'varchar' },
            { name: 'tolerance', type: 'varchar', isNullable: true },
            { name: 'frequency_type', type: 'varchar' },
            { name: 'frequency_value', type: 'int', default: 1 },
            { name: 'estimated_duration', type: 'int', default: 60 },
            { name: 'responsible_team_id', type: 'uuid', isNullable: true },
            { name: 'checklist_tasks', type: LARGE_TEXT_COLUMN_TYPE, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['plant_id'],
              referencedTableName: 'plants',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
            new TableForeignKey({
              columnNames: ['responsible_team_id'],
              referencedTableName: 'maintenance_teams',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
          ],
          uniques: [{ name: 'uq_calibration_templates_plant_name', columnNames: ['plant_id', 'template_name'] }],
        }),
      );
    }

    if (!(await queryRunner.hasTable('instrument_calibration_schedules'))) {
      await queryRunner.createTable(
        new Table({
          name: 'instrument_calibration_schedules',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'instrument_id', type: 'uuid' },
            { name: 'template_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'start_date', type: DATETIME_COLUMN_TYPE },
            { name: 'next_due_date', type: DATETIME_COLUMN_TYPE },
            { name: 'assigned_team_id', type: 'uuid', isNullable: true },
            { name: 'calibration_type', type: 'varchar', default: "'INTERNAL'" },
            { name: 'last_generated_at', type: DATETIME_COLUMN_TYPE, isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['instrument_id'],
              referencedTableName: 'machine_instruments',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
            new TableForeignKey({
              columnNames: ['template_id'],
              referencedTableName: 'calibration_templates',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
            new TableForeignKey({
              columnNames: ['plant_id'],
              referencedTableName: 'plants',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
            new TableForeignKey({
              columnNames: ['assigned_team_id'],
              referencedTableName: 'maintenance_teams',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
          ],
        }),
      );
    }

    if (!(await queryRunner.hasTable('instrument_calibration_tasks'))) {
      await queryRunner.createTable(
        new Table({
          name: 'instrument_calibration_tasks',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'schedule_id', type: 'uuid' },
            { name: 'instrument_id', type: 'uuid' },
            { name: 'template_id', type: 'uuid', isNullable: true },
            { name: 'asset_id', type: 'uuid' },
            { name: 'plant_id', type: 'uuid', isNullable: true },
            { name: 'assigned_team_id', type: 'uuid', isNullable: true },
            { name: 'calibration_type', type: 'varchar', default: "'INTERNAL'" },
            { name: 'due_date', type: DATETIME_COLUMN_TYPE },
            { name: 'started_at', type: DATETIME_COLUMN_TYPE, isNullable: true },
            { name: 'completed_at', type: DATETIME_COLUMN_TYPE, isNullable: true },
            { name: 'status', type: 'varchar', default: "'SCHEDULED'" },
            { name: 'checklist', type: LARGE_TEXT_COLUMN_TYPE, isNullable: true },
            { name: 'certificate_upload', type: LARGE_TEXT_COLUMN_TYPE, isNullable: true },
            { name: 'remarks', type: 'text', isNullable: true },
            { name: 'created_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['schedule_id'],
              referencedTableName: 'instrument_calibration_schedules',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
            new TableForeignKey({
              columnNames: ['instrument_id'],
              referencedTableName: 'machine_instruments',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
            new TableForeignKey({
              columnNames: ['template_id'],
              referencedTableName: 'calibration_templates',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
            new TableForeignKey({
              columnNames: ['asset_id'],
              referencedTableName: 'assets',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
            new TableForeignKey({
              columnNames: ['plant_id'],
              referencedTableName: 'plants',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
            new TableForeignKey({
              columnNames: ['assigned_team_id'],
              referencedTableName: 'maintenance_teams',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
          ],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of [
      'instrument_calibration_tasks',
      'instrument_calibration_schedules',
      'calibration_templates',
      'machine_instruments',
    ]) {
      if (await queryRunner.hasTable(tableName)) {
        await queryRunner.dropTable(tableName);
      }
    }
  }
}
