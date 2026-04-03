import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class AddAdvancedAmcModule1700000000025 implements MigrationInterface {
  name = 'AddAdvancedAmcModule1700000000025';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private uuidColumn(name: string) {
    return {
      name,
      type: 'uuid',
      isPrimary: name === 'id',
      isGenerated: name === 'id',
      generationStrategy: name === 'id' ? ('uuid' as const) : undefined,
      isNullable: false,
    };
  }

  private timestampColumns(queryRunner: QueryRunner) {
    const dateTimeType = this.dateTimeType(queryRunner);
    return [
      { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
      { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
    ];
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('amc_contracts', [
      new TableColumn({ name: 'contract_name', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'contract_type', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'visit_frequency', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'response_time_sla', type: 'int', isNullable: true }),
      new TableColumn({ name: 'resolution_time_sla', type: 'int', isNullable: true }),
      new TableColumn({ name: 'contract_value', type: 'decimal', precision: 12, scale: 2, isNullable: true }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'amc_contract_machines',
        columns: [
          this.uuidColumn('id'),
          { name: 'contract_id', type: 'uuid' },
          { name: 'asset_id', type: 'uuid' },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );
    await queryRunner.createUniqueConstraint(
      'amc_contract_machines',
      new TableUnique({ name: 'uq_amc_contract_machine', columnNames: ['contract_id', 'asset_id'] }),
    );
    await queryRunner.createForeignKeys('amc_contract_machines', [
      new TableForeignKey({
        columnNames: ['contract_id'],
        referencedTableName: 'amc_contracts',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['asset_id'],
        referencedTableName: 'assets',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'amc_visit_schedule',
        columns: [
          this.uuidColumn('id'),
          { name: 'contract_id', type: 'uuid' },
          { name: 'asset_id', type: 'uuid' },
          { name: 'vendor_id', type: 'uuid' },
          { name: 'visit_date', type: 'date' },
          { name: 'status', type: 'varchar', default: "'SCHEDULED'" },
          { name: 'service_task_id', type: 'uuid', isNullable: true },
          { name: 'notification_sent_at', type: this.dateTimeType(queryRunner), isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );
    await queryRunner.createUniqueConstraint(
      'amc_visit_schedule',
      new TableUnique({ name: 'uq_amc_visit_contract_asset_date', columnNames: ['contract_id', 'asset_id', 'visit_date'] }),
    );
    await queryRunner.createForeignKeys('amc_visit_schedule', [
      new TableForeignKey({
        columnNames: ['contract_id'],
        referencedTableName: 'amc_contracts',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['asset_id'],
        referencedTableName: 'assets',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['vendor_id'],
        referencedTableName: 'vendors',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['service_task_id'],
        referencedTableName: 'work_orders',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);
    await queryRunner.createIndices('amc_visit_schedule', [
      new TableIndex({ name: 'idx_amc_visit_schedule_date', columnNames: ['visit_date', 'status'] }),
      new TableIndex({ name: 'idx_amc_visit_schedule_vendor', columnNames: ['vendor_id'] }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'amc_service_reports',
        columns: [
          this.uuidColumn('id'),
          { name: 'visit_schedule_id', type: 'uuid', isNullable: true },
          { name: 'contract_id', type: 'uuid' },
          { name: 'asset_id', type: 'uuid' },
          { name: 'vendor_id', type: 'uuid' },
          { name: 'work_order_id', type: 'uuid', isNullable: true },
          { name: 'service_date', type: 'date' },
          { name: 'work_done', type: 'text' },
          { name: 'parts_replaced', type: 'text', isNullable: true },
          { name: 'observations', type: 'text', isNullable: true },
          { name: 'recommendations', type: 'text', isNullable: true },
          { name: 'next_service_date', type: 'date', isNullable: true },
          { name: 'attachments', type: 'text', isNullable: true },
          { name: 'source_type', type: 'varchar', default: "'VISIT'" },
          { name: 'verification_status', type: 'varchar', default: "'SUBMITTED'" },
          { name: 'verification_remarks', type: 'text', isNullable: true },
          { name: 'verified_by', type: 'uuid', isNullable: true },
          { name: 'verified_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'response_time_minutes', type: 'int', isNullable: true },
          { name: 'resolution_time_minutes', type: 'int', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );
    await queryRunner.createForeignKeys('amc_service_reports', [
      new TableForeignKey({
        columnNames: ['visit_schedule_id'],
        referencedTableName: 'amc_visit_schedule',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        columnNames: ['contract_id'],
        referencedTableName: 'amc_contracts',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['asset_id'],
        referencedTableName: 'assets',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['vendor_id'],
        referencedTableName: 'vendors',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['work_order_id'],
        referencedTableName: 'work_orders',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        columnNames: ['verified_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);
    await queryRunner.createIndices('amc_service_reports', [
      new TableIndex({ name: 'idx_amc_service_reports_vendor_date', columnNames: ['vendor_id', 'service_date'] }),
      new TableIndex({ name: 'idx_amc_service_reports_verification', columnNames: ['verification_status'] }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'vendor_user_mappings',
        columns: [
          this.uuidColumn('id'),
          { name: 'vendor_id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );
    await queryRunner.createUniqueConstraint(
      'vendor_user_mappings',
      new TableUnique({ name: 'uq_vendor_user_mapping', columnNames: ['vendor_id', 'user_id'] }),
    );
    await queryRunner.createForeignKeys('vendor_user_mappings', [
      new TableForeignKey({
        columnNames: ['vendor_id'],
        referencedTableName: 'vendors',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('vendor_user_mappings', true, true, true);
    await queryRunner.dropTable('amc_service_reports', true, true, true);
    await queryRunner.dropTable('amc_visit_schedule', true, true, true);
    await queryRunner.dropTable('amc_contract_machines', true, true, true);

    await queryRunner.dropColumn('amc_contracts', 'contract_value');
    await queryRunner.dropColumn('amc_contracts', 'resolution_time_sla');
    await queryRunner.dropColumn('amc_contracts', 'response_time_sla');
    await queryRunner.dropColumn('amc_contracts', 'visit_frequency');
    await queryRunner.dropColumn('amc_contracts', 'contract_type');
    await queryRunner.dropColumn('amc_contracts', 'contract_name');
  }
}
