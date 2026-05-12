import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class EnterpriseRbacAccessIndexes1700000000045 implements MigrationInterface {
  name = 'EnterpriseRbacAccessIndexes1700000000045';

  private async createIndexIfMissing(queryRunner: QueryRunner, tableName: string, index: TableIndex) {
    const table = await queryRunner.getTable(tableName);
    if (!table || table.indices.some((existing) => existing.name === index.name)) {
      return;
    }
    await queryRunner.createIndex(tableName, index);
  }

  private async dropIndexIfPresent(queryRunner: QueryRunner, tableName: string, indexName: string) {
    const table = await queryRunner.getTable(tableName);
    const index = table?.indices.find((existing) => existing.name === indexName);
    if (!table || !index) {
      return;
    }
    await queryRunner.dropIndex(tableName, index);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createIndexIfMissing(queryRunner, 'user_roles', new TableIndex({
      name: 'idx_user_roles_user_role_plant',
      columnNames: ['user_id', 'role', 'plant_id'],
    }));
    await this.createIndexIfMissing(queryRunner, 'role_permissions', new TableIndex({
      name: 'idx_role_permissions_role_module',
      columnNames: ['role', 'module_key'],
    }));
    await this.createIndexIfMissing(queryRunner, 'org_role_permissions', new TableIndex({
      name: 'idx_org_role_permissions_org_role_module',
      columnNames: ['organization_id', 'role_id', 'module_key'],
    }));
    await this.createIndexIfMissing(queryRunner, 'maintenance_teams', new TableIndex({
      name: 'idx_maintenance_teams_plant_active',
      columnNames: ['plant_id', 'is_active'],
    }));
    await this.createIndexIfMissing(queryRunner, 'work_orders', new TableIndex({
      name: 'idx_work_orders_plant_assignee_status',
      columnNames: ['plant_id', 'assigned_to', 'status'],
    }));
    await this.createIndexIfMissing(queryRunner, 'audit_logs', new TableIndex({
      name: 'idx_audit_logs_user_action_created',
      columnNames: ['user_id', 'action', 'created_at'],
    }));
    await this.createIndexIfMissing(queryRunner, 'security_events', new TableIndex({
      name: 'idx_security_events_org_plant_status',
      columnNames: ['organization_id', 'plant_id', 'status'],
    }));
    await this.createIndexIfMissing(queryRunner, 'refresh_tokens', new TableIndex({
      name: 'idx_refresh_tokens_user_session_expiry',
      columnNames: ['user_id', 'session_expires_at', 'revoked_at'],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfPresent(queryRunner, 'refresh_tokens', 'idx_refresh_tokens_user_session_expiry');
    await this.dropIndexIfPresent(queryRunner, 'security_events', 'idx_security_events_org_plant_status');
    await this.dropIndexIfPresent(queryRunner, 'audit_logs', 'idx_audit_logs_user_action_created');
    await this.dropIndexIfPresent(queryRunner, 'work_orders', 'idx_work_orders_plant_assignee_status');
    await this.dropIndexIfPresent(queryRunner, 'maintenance_teams', 'idx_maintenance_teams_plant_active');
    await this.dropIndexIfPresent(queryRunner, 'org_role_permissions', 'idx_org_role_permissions_org_role_module');
    await this.dropIndexIfPresent(queryRunner, 'role_permissions', 'idx_role_permissions_role_module');
    await this.dropIndexIfPresent(queryRunner, 'user_roles', 'idx_user_roles_user_role_plant');
  }
}
