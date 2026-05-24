import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableIndex } from 'typeorm';
import { DATETIME_COLUMN_TYPE } from '../entities/common';

export class AddSlaAndEscalationTables1700000000052 implements MigrationInterface {
  name = 'AddSlaAndEscalationTables1700000000052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sla_config table
    if (!(await queryRunner.hasTable('sla_config'))) {
      await queryRunner.createTable(
        new Table({
          name: 'sla_config',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'scope', type: 'varchar', default: "'GLOBAL'" },
            { name: 'scope_value', type: 'varchar', isNullable: true },
            { name: 'priority', type: 'varchar', default: "'MEDIUM'" },
            { name: 'response_time_minutes', type: 'int', default: 30 },
            { name: 'acknowledgement_time_minutes', type: 'int', default: 15 },
            { name: 'closure_time_minutes', type: 'int', default: 480 },
            { name: 'escalation_1_minutes', type: 'int', default: 30 },
            { name: 'escalation_2_minutes', type: 'int', default: 60 },
            { name: 'escalation_3_minutes', type: 'int', default: 120 },
            { name: 'escalation_4_minutes', type: 'int', default: 240 },
            { name: 'reminder_interval_minutes', type: 'int', default: 60 },
            { name: 'escalation_role_1', type: 'varchar', isNullable: true },
            { name: 'escalation_role_2', type: 'varchar', isNullable: true },
            { name: 'escalation_role_3', type: 'varchar', isNullable: true },
            { name: 'escalation_role_4', type: 'varchar', isNullable: true },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'description', type: 'varchar', isNullable: true },
            { name: 'created_by', type: 'uuid', isNullable: true },
            { name: 'created_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createIndex(
        'sla_config',
        new TableIndex({ name: 'idx_sla_config_scope', columnNames: ['scope', 'scope_value'] }),
      );
      await queryRunner.createIndex(
        'sla_config',
        new TableIndex({ name: 'idx_sla_config_priority', columnNames: ['priority'] }),
      );
    }

    // Create escalation_history table
    if (!(await queryRunner.hasTable('escalation_history'))) {
      await queryRunner.createTable(
        new Table({
          name: 'escalation_history',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
            { name: 'wo_id', type: 'uuid' },
            { name: 'wo_number', type: 'varchar' },
            { name: 'level', type: 'int' },
            { name: 'trigger_type', type: 'varchar' },
            { name: 'triggered_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'notified_users', type: 'text', default: "'[]'" },
            { name: 'notified_emails', type: 'text', default: "'[]'" },
            { name: 'escalated_to_role', type: 'varchar', isNullable: true },
            { name: 'escalated_to_user_id', type: 'uuid', isNullable: true },
            { name: 'status', type: 'varchar', default: "'ACTIVE'" },
            { name: 'resolved_at', type: DATETIME_COLUMN_TYPE, isNullable: true },
            { name: 'notes', type: 'text', isNullable: true },
            { name: 'reminder_count', type: 'int', default: 0 },
            { name: 'last_reminder_at', type: DATETIME_COLUMN_TYPE, isNullable: true },
            { name: 'resolved', type: 'boolean', default: false },
            { name: 'created_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: DATETIME_COLUMN_TYPE, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );

      await queryRunner.createIndex(
        'escalation_history',
        new TableIndex({ name: 'idx_escalation_wo', columnNames: ['wo_id'] }),
      );
      await queryRunner.createIndex(
        'escalation_history',
        new TableIndex({ name: 'idx_escalation_level', columnNames: ['level'] }),
      );
      await queryRunner.createIndex(
        'escalation_history',
        new TableIndex({ name: 'idx_escalation_status', columnNames: ['resolved'] }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tablesToDrop = ['sla_config', 'escalation_history'];
    for (const tableName of tablesToDrop) {
      if (await queryRunner.hasTable(tableName)) {
        // Drop indexes first
        if (tableName === 'sla_config') {
          const table = await queryRunner.getTable('sla_config');
          for (const indexName of ['idx_sla_config_scope', 'idx_sla_config_priority']) {
            const idx = table?.indices.find((i) => i.name === indexName);
            if (idx) await queryRunner.dropIndex('sla_config', idx);
          }
        }
        if (tableName === 'escalation_history') {
          const table = await queryRunner.getTable('escalation_history');
          for (const indexName of ['idx_escalation_wo', 'idx_escalation_level', 'idx_escalation_status']) {
            const idx = table?.indices.find((i) => i.name === indexName);
            if (idx) await queryRunner.dropIndex('escalation_history', idx);
          }
        }
        await queryRunner.dropTable(tableName);
      }
    }
  }
}
