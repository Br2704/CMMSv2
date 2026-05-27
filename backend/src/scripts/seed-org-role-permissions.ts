/**
 * Seed Script: Populate org_role_permissions from the fallback permission map
 *
 * This script reads all org_roles from the database and inserts the corresponding
 * org_role_permissions rows using the same permission maps as
 * buildFallbackPermissionsForRole(). This eliminates the RBAC fallback WARN log
 * spam that fires on every authenticated request (~20 warnings per page load).
 *
 * Usage:
 *   npx tsx src/scripts/seed-org-role-permissions.ts
 *
 * Or in production (Docker):
 *   docker exec cmms-backend npx tsx dist/src/scripts/seed-org-role-permissions.ts
 *
 * The script is idempotent — it clears existing permissions before reseeding.
 */

import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { OrgRoleEntity, OrgRolePermissionEntity } from '../database/entities';
import { buildEnterprisePermissionMap } from '../services/permission-engine';
import { DeleteResult } from 'typeorm';

interface PermissionRow {
  organizationId: string;
  roleId: string;
  moduleKey: string;
  actions: string[];
}

async function seedOrgRolePermissions(): Promise<void> {
  console.log('=== Seed: Org Role Permissions ===');
  console.log('');

  await AppDataSource.initialize();
  console.log('✓ Database connected.');
  console.log('');

  const orgRoleRepo = AppDataSource.getRepository(OrgRoleEntity);
  const permissionRepo = AppDataSource.getRepository(OrgRolePermissionEntity);

  // Fetch all active org roles
  const orgRoles = await orgRoleRepo.find({
    where: { isActive: true },
    relations: ['organization'],
  });
  console.log(`Found ${orgRoles.length} active org roles.`);

  if (orgRoles.length === 0) {
    console.log('No org roles found. Nothing to seed.');
    await AppDataSource.destroy();
    return;
  }

  // Build the permission rows from fallback maps
  const allRows: PermissionRow[] = [];
  const skipKeys: string[] = [];

  for (const orgRole of orgRoles) {
    const roleKey = orgRole.key;
    const permissionMap = buildEnterprisePermissionMap(roleKey);
    const entries = Object.entries(permissionMap);

    if (entries.length === 0) {
      skipKeys.push(roleKey);
      continue;
    }

    for (const [moduleKey, actions] of entries) {
      if (actions.length === 0) continue;
      allRows.push({
        organizationId: orgRole.organizationId,
        roleId: orgRole.id,
        moduleKey,
        actions,
      });
    }
  }

  console.log(`Built ${allRows.length} permission rows from fallback maps.`);
  if (skipKeys.length > 0) {
    console.log(`  Skipped (no fallback map): ${skipKeys.join(', ')}`);
  }
  console.log('');

  if (allRows.length === 0) {
    console.log('No permissions to seed. Exiting.');
    await AppDataSource.destroy();
    return;
  }

  // Use a QueryRunner for atomic transaction
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Clear existing permissions
    const existingCount = await queryRunner.manager.count(OrgRolePermissionEntity);
    if (existingCount > 0) {
      console.log(`Clearing ${existingCount} existing org_role_permissions...`);
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(OrgRolePermissionEntity)
        .execute();
      console.log('✓ Cleared existing permissions.');
    }

    // Bulk insert all permission rows using a single INSERT query
    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into(OrgRolePermissionEntity)
      .values(allRows)
      .execute();

    const total = await queryRunner.manager.count(OrgRolePermissionEntity);

    await queryRunner.commitTransaction();
    console.log('');
    console.log(`✓ Transaction committed. Total org_role_permissions: ${total}`);

    if (skipKeys.length > 0) {
      console.log(`  ⚠️  Roles without fallback map: ${skipKeys.join(', ')}`);
    }
    console.log('');
    console.log('=== Seeding complete ===');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('✗ Seed failed, transaction rolled back:', error);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('Database connection closed.');
  }
}

seedOrgRolePermissions();
