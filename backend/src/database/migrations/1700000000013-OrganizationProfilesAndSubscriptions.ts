import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class OrganizationProfilesAndSubscriptions1700000000013 implements MigrationInterface {
  name = 'OrganizationProfilesAndSubscriptions1700000000013';

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const organizationsTable = await queryRunner.getTable('organizations');
    if (!organizationsTable) {
      return;
    }

    const dateTimeType = this.dateTimeType(queryRunner);
    const ensureColumn = async (column: TableColumn) => {
      const latest = await queryRunner.getTable('organizations');
      if (!latest?.columns.some((item) => item.name === column.name)) {
        await queryRunner.addColumn('organizations', column);
      }
    };

    await ensureColumn(new TableColumn({ name: 'legal_name', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'industry', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'registration_number', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'tax_id', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'website', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'contact_email', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'contact_phone', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'primary_contact_name', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'primary_contact_email', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'primary_contact_phone', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'address_line_1', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'address_line_2', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'city', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'state', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'country', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'postal_code', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'notes', type: 'text', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'billing_cycle', type: 'varchar', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'subscription_status', type: 'varchar', default: "'DRAFT'" }));
    await ensureColumn(new TableColumn({ name: 'has_free_trial', type: 'boolean', default: false }));
    await ensureColumn(new TableColumn({ name: 'trial_start_date', type: 'date', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'trial_end_date', type: 'date', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'subscription_start_date', type: 'date', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'subscription_end_date', type: 'date', isNullable: true }));
    await ensureColumn(new TableColumn({ name: 'reminder_enabled', type: 'boolean', default: true }));
    await ensureColumn(new TableColumn({ name: 'reminder_lead_days', type: 'int', default: 60 }));
    await ensureColumn(new TableColumn({ name: 'last_reminder_sent_at', type: dateTimeType, isNullable: true }));

    const latest = await queryRunner.getTable('organizations');
    if (latest && !latest.indices.some((index) => index.name === 'idx_organizations_subscription_end_date')) {
      await queryRunner.createIndex(
        'organizations',
        new TableIndex({
          name: 'idx_organizations_subscription_end_date',
          columnNames: ['subscription_end_date'],
        }),
      );
    }
    if (latest && !latest.indices.some((index) => index.name === 'idx_organizations_trial_end_date')) {
      await queryRunner.createIndex(
        'organizations',
        new TableIndex({
          name: 'idx_organizations_trial_end_date',
          columnNames: ['trial_end_date'],
        }),
      );
    }
    if (latest && !latest.indices.some((index) => index.name === 'idx_organizations_reminder_enabled')) {
      await queryRunner.createIndex(
        'organizations',
        new TableIndex({
          name: 'idx_organizations_reminder_enabled',
          columnNames: ['reminder_enabled'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const organizationsTable = await queryRunner.getTable('organizations');
    if (!organizationsTable) {
      return;
    }

    const dropIndexIfExists = async (name: string) => {
      const latest = await queryRunner.getTable('organizations');
      const index = latest?.indices.find((item) => item.name === name);
      if (index) {
        await queryRunner.dropIndex('organizations', index);
      }
    };

    await dropIndexIfExists('idx_organizations_subscription_end_date');
    await dropIndexIfExists('idx_organizations_trial_end_date');
    await dropIndexIfExists('idx_organizations_reminder_enabled');

    const columnNames = [
      'last_reminder_sent_at',
      'reminder_lead_days',
      'reminder_enabled',
      'subscription_end_date',
      'subscription_start_date',
      'trial_end_date',
      'trial_start_date',
      'has_free_trial',
      'subscription_status',
      'billing_cycle',
      'notes',
      'postal_code',
      'country',
      'state',
      'city',
      'address_line_2',
      'address_line_1',
      'primary_contact_phone',
      'primary_contact_email',
      'primary_contact_name',
      'contact_phone',
      'contact_email',
      'website',
      'tax_id',
      'registration_number',
      'industry',
      'legal_name',
    ];

    for (const columnName of columnNames) {
      const latest = await queryRunner.getTable('organizations');
      if (latest?.columns.some((column) => column.name === columnName)) {
        await queryRunner.dropColumn('organizations', columnName);
      }
    }
  }
}
