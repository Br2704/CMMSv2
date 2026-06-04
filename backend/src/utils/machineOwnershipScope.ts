import { SelectQueryBuilder } from 'typeorm';
import type { AuthContext } from '../types/auth';
import { normalizeRoleName } from './rbac';

export function applyMachineOwnershipScope(
  qb: SelectQueryBuilder<any>,
  alias: string,
  auth: AuthContext,
  options?: { assetJoinAlias?: string; assetField?: string; departmentField?: string }
): void {
  const roles = [auth.roleKey, ...(auth.roles || [])].filter(Boolean).map((r) => normalizeRoleName(r));
  
  if (
    roles.includes('ROOT_ADMIN') ||
    roles.includes('SUPER_ADMIN') ||
    roles.includes('PLANT_ADMIN') ||
    roles.includes('MAINTENANCE_MANAGER') ||
    roles.includes('PRODUCTION_MANAGER')
  ) {
    return; // Managers/Admins see everything within their plant scope
  }

  const isOperatorOrTech =
    roles.includes('PRODUCTION_OPERATOR') || roles.includes('MAINTENANCE_TECHNICIAN');

  if (!isOperatorOrTech) {
    return; // If they are not an operator or tech, they fall back to standard permissions
  }

  const assetField = options?.assetField || (options?.assetJoinAlias ? `${options.assetJoinAlias}.id` : `${alias}.id`);
  const departmentField = options?.departmentField || (options?.assetJoinAlias ? `${options.assetJoinAlias}.department_id` : `${alias}.department_id`);
  const moduleField = options?.assetJoinAlias ? `${options.assetJoinAlias}.module_id` : `${alias}.module_id`;

  // Filter based on explicit mappings
  qb.andWhere(`(
    EXISTS (
      SELECT 1 FROM user_machine_mappings umm
      WHERE umm.user_id = :authUserId AND umm.asset_id = ${assetField}
    )
    OR EXISTS (
      SELECT 1 FROM user_department_mappings udm
      WHERE udm.user_id = :authUserId AND udm.department_id = ${departmentField}
    )
    OR EXISTS (
      SELECT 1 FROM user_module_mappings umm2
      WHERE umm2.user_id = :authUserId AND umm2.module_id = ${moduleField}
    )
  )`, { authUserId: auth.userId });
}
