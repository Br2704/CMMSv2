import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableUnique } from 'typeorm';

export class AddMaintenanceTeamsAndCategoryMappings1700000000018 implements MigrationInterface {
  name = 'AddMaintenanceTeamsAndCategoryMappings1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('maintenance_teams'))) {
      await queryRunner.createTable(
        new Table({
          name: 'maintenance_teams',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true },
            { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'team_name', type: 'varchar' },
            { name: 'discipline', type: 'varchar' },
            { name: 'team_leader_id', type: 'uuid', isNullable: true },
            { name: 'team_member_ids', type: 'text', default: "'[]'" },
            { name: 'is_active', type: 'boolean', default: true },
          ],
        }),
      );
      await queryRunner.createUniqueConstraint(
        'maintenance_teams',
        new TableUnique({
          name: 'uq_maintenance_teams_plant_team_name',
          columnNames: ['plant_id', 'team_name'],
        }),
      );
      await queryRunner.createForeignKeys('maintenance_teams', [
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
        new TableForeignKey({
          columnNames: ['team_leader_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      ]);
    }

    if (!(await queryRunner.hasTable('work_order_team_mappings'))) {
      await queryRunner.createTable(
        new Table({
          name: 'work_order_team_mappings',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true },
            { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'plant_id', type: 'uuid' },
            { name: 'category', type: 'varchar' },
            { name: 'team_id', type: 'uuid' },
          ],
        }),
      );
      await queryRunner.createUniqueConstraint(
        'work_order_team_mappings',
        new TableUnique({
          name: 'uq_work_order_team_mapping_plant_category',
          columnNames: ['plant_id', 'category'],
        }),
      );
      await queryRunner.createForeignKeys('work_order_team_mappings', [
        new TableForeignKey({
          columnNames: ['plant_id'],
          referencedTableName: 'plants',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
        new TableForeignKey({
          columnNames: ['team_id'],
          referencedTableName: 'maintenance_teams',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('work_order_team_mappings')) {
      await queryRunner.dropTable('work_order_team_mappings');
    }
    if (await queryRunner.hasTable('maintenance_teams')) {
      await queryRunner.dropTable('maintenance_teams');
    }
  }
}
