import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddAuditLogs1700000000001 implements MigrationInterface {
  name = 'AddAuditLogs1700000000001';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'user_id', type: 'uuid', isNullable: true },
          { name: 'action', type: 'varchar' },
          { name: 'module', type: 'varchar', isNullable: true },
          { name: 'entity_name', type: 'varchar', isNullable: true },
          { name: 'entity_id', type: 'varchar', isNullable: true },
          { name: 'method', type: 'varchar', isNullable: true },
          { name: 'path', type: 'varchar', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'status_code', type: 'int', isNullable: true },
          { name: 'ip_address', type: 'varchar', isNullable: true },
          { name: 'user_agent', type: 'varchar', isNullable: true },
          { name: 'metadata', type: 'text', isNullable: true },
          { name: 'created_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'audit_logs',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({ name: 'idx_audit_logs_user_created', columnNames: ['user_id', 'created_at'] }),
    );
    await queryRunner.createIndex('audit_logs', new TableIndex({ name: 'idx_audit_logs_module', columnNames: ['module'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('audit_logs', 'idx_audit_logs_module');
    await queryRunner.dropIndex('audit_logs', 'idx_audit_logs_user_created');
    const table = await queryRunner.getTable('audit_logs');
    const fk = table?.foreignKeys.find((item) => item.columnNames.includes('user_id'));
    if (fk) {
      await queryRunner.dropForeignKey('audit_logs', fk);
    }
    await queryRunner.dropTable('audit_logs');
  }
}
