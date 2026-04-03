import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

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

  private dateTimeType(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === 'mssql' ? 'datetime2' : 'timestamp';
  }

  private timestampColumns(queryRunner: QueryRunner) {
    const dateTimeType = this.dateTimeType(queryRunner);
    return [
      { name: 'created_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
      { name: 'updated_at', type: dateTimeType, default: 'CURRENT_TIMESTAMP' },
    ];
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          this.uuidColumn('id'),
          { name: 'email', type: 'varchar', isUnique: true },
          { name: 'password_hash', type: 'varchar' },
          { name: 'full_name', type: 'varchar' },
          { name: 'phone', type: 'varchar', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [this.uuidColumn('id'), { name: 'name', type: 'varchar', isUnique: true }, ...this.timestampColumns(queryRunner)],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'plants',
        columns: [
          this.uuidColumn('id'),
          { name: 'plant_code', type: 'varchar', isUnique: true },
          { name: 'plant_name', type: 'varchar' },
          { name: 'location', type: 'varchar', isNullable: true },
          { name: 'plant_admin_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'profiles',
        columns: [
          this.uuidColumn('id'),
          { name: 'user_id', type: 'uuid', isUnique: true },
          { name: 'user_code', type: 'varchar', isUnique: true },
          { name: 'full_name', type: 'varchar' },
          { name: 'email', type: 'varchar' },
          { name: 'phone', type: 'varchar', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'department', type: 'varchar', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          this.uuidColumn('id'),
          { name: 'user_id', type: 'uuid' },
          { name: 'role', type: 'varchar' },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          this.uuidColumn('id'),
          { name: 'user_id', type: 'uuid' },
          { name: 'token_hash', type: 'varchar' },
          { name: 'expires_at', type: this.dateTimeType(queryRunner) },
          { name: 'revoked_at', type: this.dateTimeType(queryRunner), isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'role_permissions',
        columns: [
          this.uuidColumn('id'),
          { name: 'role', type: 'varchar' },
          { name: 'module_id', type: 'varchar' },
          { name: 'actions', type: 'text' },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'departments',
        columns: [
          this.uuidColumn('id'),
          { name: 'name', type: 'varchar' },
          { name: 'code', type: 'varchar' },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'parent_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'cost_centers',
        columns: [
          this.uuidColumn('id'),
          { name: 'code', type: 'varchar' },
          { name: 'name', type: 'varchar' },
          { name: 'department_id', type: 'uuid', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'vendors',
        columns: [
          this.uuidColumn('id'),
          { name: 'code', type: 'varchar', isUnique: true },
          { name: 'name', type: 'varchar' },
          { name: 'contact_person', type: 'varchar', isNullable: true },
          { name: 'email', type: 'varchar', isNullable: true },
          { name: 'phone', type: 'varchar', isNullable: true },
          { name: 'address', type: 'text', isNullable: true },
          { name: 'gst_number', type: 'varchar', isNullable: true },
          { name: 'category', type: 'varchar', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'assets',
        columns: [
          this.uuidColumn('id'),
          { name: 'code', type: 'varchar', isUnique: true },
          { name: 'name', type: 'varchar' },
          { name: 'type', type: 'varchar', default: "'MACHINE'" },
          { name: 'department_id', type: 'uuid', isNullable: true },
          { name: 'cost_center_id', type: 'uuid', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'criticality', type: 'varchar', default: "'MEDIUM'" },
          { name: 'commission_date', type: 'date', isNullable: true },
          { name: 'warranty_expiry', type: 'date', isNullable: true },
          { name: 'status', type: 'varchar', default: "'ACTIVE'" },
          { name: 'make', type: 'varchar', isNullable: true },
          { name: 'model', type: 'varchar', isNullable: true },
          { name: 'serial_number', type: 'varchar', isNullable: true },
          { name: 'location', type: 'varchar', isNullable: true },
          { name: 'vendor_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'work_orders',
        columns: [
          this.uuidColumn('id'),
          { name: 'wo_number', type: 'varchar', isUnique: true },
          { name: 'asset_id', type: 'uuid' },
          { name: 'category', type: 'varchar' },
          { name: 'priority', type: 'varchar', default: "'MEDIUM'" },
          { name: 'status', type: 'varchar', default: "'RAISED'" },
          { name: 'problem_description', type: 'text' },
          { name: 'raised_by', type: 'uuid', isNullable: true },
          { name: 'assigned_to', type: 'uuid', isNullable: true },
          { name: 'opened_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'closed_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'root_cause', type: 'text', isNullable: true },
          { name: 'action_taken', type: 'text', isNullable: true },
          { name: 'downtime_minutes', type: 'int', default: 0 },
          { name: 'operator_fault', type: 'boolean', default: false },
          { name: 'remarks', type: 'text', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'wo_type', type: 'varchar', default: "'BREAKDOWN'" },
          { name: 'reported_location', type: 'varchar', isNullable: true },
          { name: 'failure_code', type: 'varchar', isNullable: true },
          { name: 'sub_category', type: 'varchar', isNullable: true },
          { name: 'labor_hours', type: 'decimal', precision: 10, scale: 2, default: 0 },
          { name: 'estimated_cost', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'actual_cost', type: 'decimal', precision: 12, scale: 2, default: 0 },
          { name: 'vendor_id', type: 'uuid', isNullable: true },
          { name: 'warranty_claim', type: 'boolean', default: false },
          { name: 'safety_related', type: 'boolean', default: false },
          { name: 'parts_replaced', type: 'text', isNullable: true },
          { name: 'follow_up_required', type: 'boolean', default: false },
          { name: 'follow_up_notes', type: 'text', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      }),
    );

    const simpleTables = [
      {
        name: 'pm_schedules',
        columns: [
          this.uuidColumn('id'),
          { name: 'asset_id', type: 'uuid' },
          { name: 'frequency', type: 'varchar' },
          { name: 'checklist', type: 'text', isNullable: true },
          { name: 'assigned_to', type: 'uuid', isNullable: true },
          { name: 'last_completed', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'next_due', type: this.dateTimeType(queryRunner) },
          { name: 'status', type: 'varchar', default: "'SCHEDULED'" },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'spare_items',
        columns: [
          this.uuidColumn('id'),
          { name: 'code', type: 'varchar', isUnique: true },
          { name: 'name', type: 'varchar' },
          { name: 'category', type: 'varchar', isNullable: true },
          { name: 'current_stock', type: 'int', default: 0 },
          { name: 'min_level', type: 'int', default: 0 },
          { name: 'reorder_level', type: 'int', default: 0 },
          { name: 'unit', type: 'varchar', default: "'Pcs'" },
          { name: 'location', type: 'varchar', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'stock_requests',
        columns: [
          this.uuidColumn('id'),
          { name: 'spare_item_id', type: 'uuid' },
          { name: 'quantity', type: 'int' },
          { name: 'requested_by', type: 'uuid' },
          { name: 'work_order_id', type: 'uuid', isNullable: true },
          { name: 'status', type: 'varchar', default: "'REQUESTED'" },
          { name: 'approved_by', type: 'uuid', isNullable: true },
          { name: 'approved_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'remarks', type: 'text', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'calibration_records',
        columns: [
          this.uuidColumn('id'),
          { name: 'asset_id', type: 'uuid' },
          { name: 'calibration_date', type: 'date', isNullable: true },
          { name: 'next_due_date', type: 'date' },
          { name: 'status', type: 'varchar', default: "'SCHEDULED'" },
          { name: 'performed_by', type: 'uuid', isNullable: true },
          { name: 'vendor_id', type: 'uuid', isNullable: true },
          { name: 'certificate_number', type: 'varchar', isNullable: true },
          { name: 'remarks', type: 'text', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'amc_contracts',
        columns: [
          this.uuidColumn('id'),
          { name: 'contract_number', type: 'varchar' },
          { name: 'asset_id', type: 'uuid' },
          { name: 'vendor_id', type: 'uuid' },
          { name: 'start_date', type: 'date' },
          { name: 'end_date', type: 'date' },
          { name: 'amount', type: 'decimal', precision: 12, scale: 2, isNullable: true },
          { name: 'status', type: 'varchar', default: "'ACTIVE'" },
          { name: 'terms', type: 'text', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'gates',
        columns: [
          this.uuidColumn('id'),
          { name: 'gate_code', type: 'varchar', isUnique: true },
          { name: 'gate_name', type: 'varchar' },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'location', type: 'varchar', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'gate_entries',
        columns: [
          this.uuidColumn('id'),
          { name: 'gate_id', type: 'uuid' },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'visitor_name', type: 'varchar' },
          { name: 'visitor_company', type: 'varchar', isNullable: true },
          { name: 'visitor_phone', type: 'varchar', isNullable: true },
          { name: 'visitor_type', type: 'varchar', default: "'VISITOR'" },
          { name: 'purpose', type: 'varchar', isNullable: true },
          { name: 'person_to_meet', type: 'varchar', isNullable: true },
          { name: 'vehicle_number', type: 'varchar', isNullable: true },
          { name: 'id_proof_type', type: 'varchar', isNullable: true },
          { name: 'id_proof_number', type: 'varchar', isNullable: true },
          { name: 'items_carried', type: 'text', isNullable: true },
          { name: 'entry_time', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          { name: 'exit_time', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'badge_number', type: 'varchar', isNullable: true },
          { name: 'remarks', type: 'text', isNullable: true },
          { name: 'recorded_by', type: 'uuid', isNullable: true },
          { name: 'status', type: 'varchar', default: "'IN'" },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'notifications',
        columns: [
          this.uuidColumn('id'),
          { name: 'user_id', type: 'uuid' },
          { name: 'title', type: 'varchar' },
          { name: 'message', type: 'text' },
          { name: 'type', type: 'varchar', default: "'info'" },
          { name: 'is_read', type: 'boolean', default: false },
          { name: 'link', type: 'varchar', isNullable: true },
          { name: 'wo_id', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'shifts',
        columns: [
          this.uuidColumn('id'),
          { name: 'shift_name', type: 'varchar' },
          { name: 'start_time', type: 'varchar' },
          { name: 'end_time', type: 'varchar' },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'log_templates',
        columns: [
          this.uuidColumn('id'),
          { name: 'template_name', type: 'varchar' },
          { name: 'category', type: 'varchar', default: "'UTILITY'" },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'frequency', type: 'varchar', default: "'PER_SHIFT'" },
          { name: 'reminder_minutes_before', type: 'int', default: 0 },
          { name: 'overdue_alert_minutes', type: 'int', default: 30 },
          { name: 'notify_at_shift_start', type: 'boolean', default: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'created_by', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'log_template_fields',
        columns: [
          this.uuidColumn('id'),
          { name: 'template_id', type: 'uuid' },
          { name: 'section_name', type: 'varchar', default: "'General'" },
          { name: 'field_name', type: 'varchar' },
          { name: 'field_label', type: 'varchar' },
          { name: 'field_type', type: 'varchar', default: "'TEXT'" },
          { name: 'options', type: 'text', isNullable: true },
          { name: 'is_required', type: 'boolean', default: false },
          { name: 'min_value', type: 'decimal', precision: 12, scale: 2, isNullable: true },
          { name: 'max_value', type: 'decimal', precision: 12, scale: 2, isNullable: true },
          { name: 'unit', type: 'varchar', isNullable: true },
          { name: 'display_order', type: 'int', default: 0 },
          { name: 'validation_rules', type: 'text', isNullable: true },
          { name: 'conditional_on', type: 'text', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'log_template_assignments',
        columns: [
          this.uuidColumn('id'),
          { name: 'template_id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'log_entries',
        columns: [
          this.uuidColumn('id'),
          { name: 'template_id', type: 'uuid' },
          { name: 'shift_id', type: 'uuid', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'logged_by', type: 'uuid', isNullable: true },
          { name: 'log_date', type: 'date', default: 'CURRENT_DATE' },
          { name: 'status', type: 'varchar', default: "'DRAFT'" },
          { name: 'submitted_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'approved_by', type: 'uuid', isNullable: true },
          { name: 'approved_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'remarks', type: 'text', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'log_entry_values',
        columns: [
          this.uuidColumn('id'),
          { name: 'entry_id', type: 'uuid' },
          { name: 'field_id', type: 'uuid' },
          { name: 'value', type: 'text', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'esg_metrics',
        columns: [
          this.uuidColumn('id'),
          { name: 'metric_name', type: 'varchar' },
          { name: 'category', type: 'varchar', default: "'Energy'" },
          { name: 'unit', type: 'varchar', isNullable: true },
          { name: 'target_value', type: 'decimal', precision: 12, scale: 2, isNullable: true },
          { name: 'template_id', type: 'uuid', isNullable: true },
          { name: 'field_id', type: 'uuid', isNullable: true },
          { name: 'aggregation_method', type: 'varchar', default: "'SUM'" },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'safety_incidents',
        columns: [
          this.uuidColumn('id'),
          { name: 'incident_number', type: 'varchar', isUnique: true },
          { name: 'incident_type', type: 'varchar' },
          { name: 'severity', type: 'varchar', default: "'LOW'" },
          { name: 'location', type: 'varchar', isNullable: true },
          { name: 'description', type: 'text' },
          { name: 'immediate_action', type: 'text', isNullable: true },
          { name: 'root_cause', type: 'text', isNullable: true },
          { name: 'corrective_action', type: 'text', isNullable: true },
          { name: 'reported_by', type: 'uuid', isNullable: true },
          { name: 'investigated_by', type: 'uuid', isNullable: true },
          { name: 'status', type: 'varchar', default: "'OPEN'" },
          { name: 'incident_date', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          { name: 'closure_date', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'lost_time_hours', type: 'decimal', precision: 10, scale: 2, default: 0 },
          { name: 'people_involved', type: 'int', default: 0 },
          { name: 'work_order_id', type: 'uuid', isNullable: true },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'safety_metrics',
        columns: [
          this.uuidColumn('id'),
          { name: 'metric_name', type: 'varchar' },
          { name: 'category', type: 'varchar', default: "'General'" },
          { name: 'unit', type: 'varchar', isNullable: true },
          { name: 'target_value', type: 'decimal', precision: 12, scale: 2, isNullable: true },
          { name: 'template_id', type: 'uuid', isNullable: true },
          { name: 'field_id', type: 'uuid', isNullable: true },
          { name: 'aggregation_method', type: 'varchar', default: "'SUM'" },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'email_report_schedules',
        columns: [
          this.uuidColumn('id'),
          { name: 'report_name', type: 'varchar' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'frequency', type: 'varchar', default: "'DAILY'" },
          { name: 'send_time', type: 'varchar', default: "'08:00'" },
          { name: 'recipients', type: 'text' },
          { name: 'is_enabled', type: 'boolean', default: true },
          { name: 'last_sent_at', type: this.dateTimeType(queryRunner), isNullable: true },
          { name: 'report_sections', type: 'text', isNullable: true },
          { name: 'filters', type: 'text', isNullable: true },
          { name: 'include_charts', type: 'boolean', default: true },
          { name: 'include_tables', type: 'boolean', default: true },
          { name: 'include_detailed_logs', type: 'boolean', default: false },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          { name: 'created_by', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'email_report_logs',
        columns: [
          this.uuidColumn('id'),
          { name: 'schedule_id', type: 'uuid' },
          { name: 'sent_at', type: this.dateTimeType(queryRunner), default: 'CURRENT_TIMESTAMP' },
          { name: 'status', type: 'varchar', default: "'SUCCESS'" },
          { name: 'recipients', type: 'text' },
          { name: 'error_message', type: 'text', isNullable: true },
          { name: 'records_included', type: 'int', default: 0 },
          { name: 'report_data', type: 'text', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
      {
        name: 'vendor_notification_settings',
        columns: [
          this.uuidColumn('id'),
          { name: 'vendor_id', type: 'uuid' },
          { name: 'notify_email', type: 'boolean', default: true },
          { name: 'notify_in_app', type: 'boolean', default: true },
          { name: 'notify_before_days', type: 'text' },
          { name: 'notify_on_renewal_due', type: 'boolean', default: true },
          { name: 'contact_emails', type: 'text' },
          { name: 'plant_id', type: 'uuid', isNullable: true },
          ...this.timestampColumns(queryRunner),
        ],
      },
    ];

    for (const table of simpleTables) {
      await queryRunner.createTable(new Table(table as any));
    }

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({ name: 'idx_notifications_user_unread', columnNames: ['user_id', 'is_read'] }),
    );

    const fks = [
      new TableForeignKey({ columnNames: ['user_id'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' }),
    ];
    await queryRunner.createForeignKeys('profiles', [
      ...fks,
      new TableForeignKey({ columnNames: ['plant_id'], referencedTableName: 'plants', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
    ]);

    await queryRunner.createForeignKeys('user_roles', [
      new TableForeignKey({ columnNames: ['user_id'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' }),
      new TableForeignKey({ columnNames: ['plant_id'], referencedTableName: 'plants', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
    ]);

    await queryRunner.createForeignKey(
      'refresh_tokens',
      new TableForeignKey({ columnNames: ['user_id'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' }),
    );

    await queryRunner.createForeignKeys('assets', [
      new TableForeignKey({ columnNames: ['department_id'], referencedTableName: 'departments', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
      new TableForeignKey({ columnNames: ['cost_center_id'], referencedTableName: 'cost_centers', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
      new TableForeignKey({ columnNames: ['plant_id'], referencedTableName: 'plants', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
      new TableForeignKey({ columnNames: ['vendor_id'], referencedTableName: 'vendors', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
    ]);

    await queryRunner.createForeignKeys('work_orders', [
      new TableForeignKey({ columnNames: ['asset_id'], referencedTableName: 'assets', referencedColumnNames: ['id'], onDelete: 'RESTRICT' }),
      new TableForeignKey({ columnNames: ['plant_id'], referencedTableName: 'plants', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
      new TableForeignKey({ columnNames: ['vendor_id'], referencedTableName: 'vendors', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
    ]);

    await queryRunner.createForeignKey(
      'notifications',
      new TableForeignKey({ columnNames: ['user_id'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'vendor_notification_settings',
      'email_report_logs',
      'email_report_schedules',
      'safety_metrics',
      'safety_incidents',
      'esg_metrics',
      'log_entry_values',
      'log_entries',
      'log_template_assignments',
      'log_template_fields',
      'log_templates',
      'shifts',
      'notifications',
      'gate_entries',
      'gates',
      'amc_contracts',
      'calibration_records',
      'stock_requests',
      'spare_items',
      'pm_schedules',
      'work_orders',
      'assets',
      'vendors',
      'cost_centers',
      'departments',
      'role_permissions',
      'refresh_tokens',
      'user_roles',
      'profiles',
      'plants',
      'roles',
      'users',
    ];

    for (const table of tables) {
      await queryRunner.dropTable(table, true, true, true);
    }
  }
}
