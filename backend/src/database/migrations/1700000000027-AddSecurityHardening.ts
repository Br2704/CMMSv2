import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddSecurityHardening1700000000027 implements MigrationInterface {
  name = 'AddSecurityHardening1700000000027';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({ name: 'mfa_enabled', type: 'boolean', default: false }),
      new TableColumn({ name: 'mfa_secret_encrypted', type: 'text', isNullable: true }),
      new TableColumn({ name: 'failed_login_count', type: 'int', default: 0 }),
      new TableColumn({ name: 'locked_until', type: this.dateTimeType(queryRunner), isNullable: true }),
      new TableColumn({ name: 'last_login_at', type: this.dateTimeType(queryRunner), isNullable: true }),
      new TableColumn({ name: 'last_login_ip', type: 'varchar', isNullable: true }),
    ]);

    await queryRunner.addColumns('refresh_tokens', [
      new TableColumn({ name: 'session_expires_at', type: this.dateTimeType(queryRunner), isNullable: true }),
      new TableColumn({ name: 'created_ip', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'created_user_agent', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'replaced_by_token_id', type: 'uuid', isNullable: true }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'security_events',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' as const },
          { name: 'user_id', type: 'uuid', isNullable: true },
          { name: 'organization_id', type: 'uuid', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'event_type', type: 'varchar' },
          { name: 'severity', type: 'varchar', default: "'MEDIUM'" },
          { name: 'status', type: 'varchar', default: "'OPEN'" },
          { name: 'module', type: 'varchar', isNullable: true },
          { name: 'action', type: 'varchar', isNullable: true },
          { name: 'path', type: 'varchar', isNullable: true },
          { name: 'message', type: 'text' },
          { name: 'ip_address', type: 'varchar', isNullable: true },
          { name: 'user_agent', type: 'varchar', isNullable: true },
          { name: 'detected_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          { name: 'acknowledged_by', type: 'uuid', isNullable: true },
          { name: 'acknowledged_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'resolved_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'metadata', type: 'text', isNullable: true },
          { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
        ],
      }),
    );

    await queryRunner.createForeignKeys('security_events', [
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        columnNames: ['organization_id'],
        referencedTableName: 'organizations',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        columnNames: ['plant_id'],
        referencedTableName: 'plants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        columnNames: ['acknowledged_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createIndices('security_events', [
      new TableIndex({ name: 'idx_security_events_detected', columnNames: ['detected_at'] }),
      new TableIndex({ name: 'idx_security_events_severity_status', columnNames: ['severity', 'status'] }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('security_events', true, true, true);
    await queryRunner.dropColumn('refresh_tokens', 'replaced_by_token_id');
    await queryRunner.dropColumn('refresh_tokens', 'created_user_agent');
    await queryRunner.dropColumn('refresh_tokens', 'created_ip');
    await queryRunner.dropColumn('refresh_tokens', 'session_expires_at');
    await queryRunner.dropColumn('users', 'last_login_ip');
    await queryRunner.dropColumn('users', 'last_login_at');
    await queryRunner.dropColumn('users', 'locked_until');
    await queryRunner.dropColumn('users', 'failed_login_count');
    await queryRunner.dropColumn('users', 'mfa_secret_encrypted');
    await queryRunner.dropColumn('users', 'mfa_enabled');
  }
}
