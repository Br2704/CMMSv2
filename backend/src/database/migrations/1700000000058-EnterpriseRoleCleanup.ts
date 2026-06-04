import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnterpriseRoleCleanup1700000000058 implements MigrationInterface {
  name = 'EnterpriseRoleCleanup1700000000058';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const mappings = [
      { old: 'SUPER_ADMIN', new: 'SUPER_ADMIN' },
      { old: 'PLANT_ADMIN', new: 'PLANT_ADMIN' },
      { old: 'PLANTADMIN', new: 'PLANT_ADMIN' },
      { old: 'MAINTENANCE_MANAGER', new: 'MAINTENANCE_MANAGER' },
      { old: 'SUPERVISOR', new: 'MAINTENANCE_MANAGER' },
      { old: 'MAINTENANCE_USER', new: 'MAINTENANCE_USER' },
      { old: 'OPERATOR', new: 'PRODUCTION_USER' },
      { old: 'ENGINEER', new: 'MAINTENANCE_USER' },
      { old: 'TECHNICIAN', new: 'MAINTENANCE_USER' },
      { old: 'EMPLOYEE', new: 'MAINTENANCE_USER' },
      { old: 'GUEST', new: 'VISITOR' },
      { old: 'SECURITY', new: 'SECURITY' },
    ];

    // Helper to safely update a table, deleting duplicates if a unique constraint violation occurs
    const safeUpdate = async (tableName: string, roleColumn: string, oldVal: string, newVal: string, uniqueColumns: string[]) => {
      // Find all rows with the old role
      const rows = await queryRunner.query(`SELECT * FROM ${tableName} WHERE UPPER(${roleColumn}) = UPPER($1)`, [oldVal]);
      
      for (const row of rows) {
        // Check if the new role already exists for this unique combination
        const conditions = uniqueColumns.map(col => `${col} ${row[col] === null ? 'IS NULL' : `= '${row[col]}'`}`).join(' AND ');
        const existing = await queryRunner.query(
          `SELECT id FROM ${tableName} WHERE UPPER(${roleColumn}) = UPPER($1) AND ${conditions}`,
          [newVal]
        );
        
        if (existing.length > 0) {
          // Duplicate exists, just delete the old legacy role
          await queryRunner.query(`DELETE FROM ${tableName} WHERE id = $1`, [row.id]);
        } else {
          // Safe to update
          await queryRunner.query(`UPDATE ${tableName} SET ${roleColumn} = $1 WHERE id = $2`, [newVal, row.id]);
        }
      }
    };

    for (const map of mappings) {
      await safeUpdate('user_roles', 'role', map.old, map.new, ['user_id', 'plant_id']);
      await safeUpdate('role_permissions', 'role', map.old, map.new, ['module_id', 'module_key']);
      await safeUpdate('org_roles', 'key', map.old, map.new, ['organization_id']);
    }

    // After updating mapped roles, delete ANY roles that are NOT in the approved list
    const approvedRoles = [
      'ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN', 'ESG_ADMIN', 'HR_ADMIN',
      'MAINTENANCE_MANAGER', 'PRODUCTION_MANAGER', 'SCM_MANAGER', 'HR_MANAGER',
      'CALIBRATION_MANAGER', 'ACCOUNTS_MANAGER', 'SAFETY_MANAGER', 'ESG_MANAGER',
      'MAINTENANCE_USER', 'PRODUCTION_USER', 'SCM_USER', 'HR_USER', 'CALIBRATION_USER',
      'ACCOUNTS_USER', 'SAFETY_USER', 'ESG_USER', 'VISITOR', 'VENDOR', 'SECURITY',
      'MAINTENANCE_TECHNICIAN', 'PRODUCTION_OPERATOR'
    ];

    const formatList = approvedRoles.map(r => `'${r}'`).join(',');

    await queryRunner.query(`DELETE FROM user_roles WHERE UPPER(role) NOT IN (${formatList})`);
    await queryRunner.query(`DELETE FROM role_permissions WHERE UPPER(role) NOT IN (${formatList})`);
    await queryRunner.query(`DELETE FROM org_roles WHERE UPPER(key) NOT IN (${formatList})`);
    
    // Attempt to update the 'roles' table itself, or delete unapproved roles
    for (const map of mappings) {
      const existingNew = await queryRunner.query(`SELECT id FROM roles WHERE UPPER(name) = UPPER($1)`, [map.new]);
      if (existingNew.length > 0) {
         await queryRunner.query(`DELETE FROM roles WHERE UPPER(name) = UPPER($1)`, [map.old]);
      } else {
         await queryRunner.query(`UPDATE roles SET name = $1 WHERE UPPER(name) = UPPER($2)`, [map.new, map.old]);
      }
    }
    await queryRunner.query(`DELETE FROM roles WHERE UPPER(name) NOT IN (${formatList})`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Migration is destructive, cannot safely rollback arbitrary unmapped roles
  }
}
