import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTemporaryVisitorRole1700000000048 implements MigrationInterface {
  name = 'RemoveTemporaryVisitorRole1700000000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Reassign any users with TEMPORARY_VISITOR role to VISITOR role if they exist
    const visitorRoleRows = await queryRunner.query("SELECT id FROM roles WHERE UPPER(name) = 'VISITOR'");
    const visitorRoleId = Array.isArray(visitorRoleRows) && visitorRoleRows.length > 0 ? visitorRoleRows[0].id : null;

    if (visitorRoleId) {
      await queryRunner.query(
        `UPDATE user_roles SET role = 'VISITOR', role_id = '${visitorRoleId}' WHERE UPPER(role) = 'TEMPORARY_VISITOR'`,
      );
    }

    // 2. Remove TEMPORARY_VISITOR from org_roles
    await queryRunner.query("DELETE FROM org_roles WHERE UPPER(key) = 'TEMPORARY_VISITOR'");

    // 3. Remove TEMPORARY_VISITOR from roles catalog
    await queryRunner.query("DELETE FROM roles WHERE UPPER(name) = 'TEMPORARY_VISITOR'");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No easy way to undo this perfectly without knowing original IDs, but we can re-insert defaults if needed.
    // However, since the goal is to remove it permanently, down can be a no-op or just re-add the row.
  }
}
