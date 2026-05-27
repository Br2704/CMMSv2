// ============================================================================
// Enterprise Permission Engine
// ============================================================================
// Centralized, authoritative permission evaluation engine for the entire
// CMMS/EAM platform. ALL permission checks MUST go through this engine.
//
// Design Principles:
// 1. Single source of truth — role-to-permission mapping defined here
// 2. Hierarchy-aware — managers inherit from users, admins from managers
// 3. Scope-aware — respects PLATFORM/ORGANIZATION/PLANT/ASSIGNED scopes
// 4. Extensible — supports DB overrides for custom roles
// 5. Zero-trust — denies by default, grants explicitly
// ============================================================================

import { resolveCanonicalRoleKey } from '../config/enterprise-roles';
import {
  RBAC_ACTIONS,
  OPERATION_MODULES,
  GATE_MODULES,
  SECURITY_MODULES,
  MASTER_MODULES,
  GOVERNANCE_MODULES,
  MODULE_ALIASES,
  normalizeModuleKey as normalizeModuleKeyFromConfig,
  normalizeAction as normalizeActionFromConfig,
} from '../config/permission-modules';
import type { RbacAction } from '../config/permission-modules';
import type { AuthContext } from '../types/auth';
import { walkInheritanceUp } from './role-hierarchy';

// ============================================================================
// TYPES
// ============================================================================

export interface PermissionDecision {
  allowed: boolean;
  moduleKey: string;
  action: string;
  permissionKey: string;
  reason?: string;
}

export type PermissionMap = Record<string, string[]>;

// ============================================================================
// ACTION NORMALIZATION
// ============================================================================

/** Normalize action — delegates to config */
export { normalizeActionFromConfig as normalizeAction };
const normalizeAction = normalizeActionFromConfig;

/** Normalize module key — delegates to config */
export { normalizeModuleKeyFromConfig as normalizeModuleKey };
const normalizeModuleKey = normalizeModuleKeyFromConfig;

/** Get candidate module keys (handles aliases — resolves both forward and reverse) */
export function resolveModuleKeys(moduleId: string): string[] {
  const normalized = normalizeModuleKeyFromConfig(moduleId);
  // Find all aliases that point to this module key
  const reverseAliases = Object.entries(MODULE_ALIASES)
    .filter(([, value]) => value === normalized)
    .map(([key]) => key);
  return Array.from(new Set([normalized, ...reverseAliases]));
}

// ============================================================================
// PERMISSION MATRIX — THE SINGLE SOURCE OF TRUTH
// ============================================================================
// Each role maps to its allowed module-to-actions permissions.
// Inheritance is handled automatically by the engine.
// ============================================================================

const ALL_ACTIONS = [...RBAC_ACTIONS];
const READ_ACTION: RbacAction[] = ['READ'];
const READ_UPDATE: RbacAction[] = ['READ', 'UPDATE'];
const READ_CREATE: RbacAction[] = ['READ', 'CREATE'];
const READ_CREATE_UPDATE: RbacAction[] = ['READ', 'CREATE', 'UPDATE'];
const READ_CRUD: RbacAction[] = ['READ', 'CREATE', 'UPDATE', 'DELETE'];
const READ_CRUD_EXPORT: RbacAction[] = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT'];
const READ_CRUD_EXPORT_APPROVE: RbacAction[] = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE'];
const READ_CRUD_ALL: RbacAction[] = [...ALL_ACTIONS];

// --------------------------------------------------------------------------
// Role-to-Permissions Mapping
// --------------------------------------------------------------------------

function defineRolePermissions(): Record<string, PermissionMap> {
  const permissions: Record<string, PermissionMap> = {};

  // ============================
  // ROOT ADMIN — Full platform access
  // ============================
  permissions.ROOT_ADMIN = {};
  for (const moduleKey of [...OPERATION_MODULES, ...GATE_MODULES, ...SECURITY_MODULES, ...MASTER_MODULES, ...GOVERNANCE_MODULES]) {
    permissions.ROOT_ADMIN[moduleKey] = [...ALL_ACTIONS];
  }

  // ============================
  // SUPER ADMIN — Full org access (operational + governance except orgs read-only)
  // ============================
  permissions.SUPER_ADMIN = {};
  for (const moduleKey of [...OPERATION_MODULES, ...GATE_MODULES, ...SECURITY_MODULES, ...MASTER_MODULES]) {
    permissions.SUPER_ADMIN[moduleKey] = [...ALL_ACTIONS];
  }
  // Governance restrictions
  permissions.SUPER_ADMIN['ORGANIZATIONS'] = ['READ'];
  permissions.SUPER_ADMIN['PLANTS'] = ['READ', 'UPDATE'];
  permissions.SUPER_ADMIN['ROLE_ACCESS'] = ['READ'];

  // ============================
  // PLANT ADMIN — Full plant access (read governance modules)
  // ============================
  permissions.PLANT_ADMIN = {};
  for (const moduleKey of [...OPERATION_MODULES, ...GATE_MODULES, ...SECURITY_MODULES, ...MASTER_MODULES]) {
    permissions.PLANT_ADMIN[moduleKey] = [...ALL_ACTIONS];
  }
  permissions.PLANT_ADMIN['ORGANIZATIONS'] = ['READ'];
  permissions.PLANT_ADMIN['PLANTS'] = ['READ'];
  permissions.PLANT_ADMIN['ROLE_ACCESS'] = ['READ'];

  // ============================
  // ESG ADMIN — Org-scoped ESG + read-most
  // ============================
  permissions.ESG_ADMIN = {};
  for (const moduleKey of OPERATION_MODULES) {
    if (moduleKey === 'ESG') {
      permissions.ESG_ADMIN[moduleKey] = [...ALL_ACTIONS];
    } else if (['DASHBOARD', 'ASSETS', 'REPORTS', 'NOTIFICATIONS', 'ALERTS', 'LOGS', 'BENCHMARKING', 'ANALYTICS'].includes(moduleKey)) {
      permissions.ESG_ADMIN[moduleKey] = [...READ_CRUD_EXPORT];
    } else {
      permissions.ESG_ADMIN[moduleKey] = ['READ'];
    }
  }
  permissions.ESG_ADMIN['GATES'] = ['READ'];
  permissions.ESG_ADMIN['VISITOR_EXPERIENCE'] = ['READ'];
  permissions.ESG_ADMIN['SECURITY'] = ['READ'];
  // Master data for ESG
  for (const moduleKey of ['PLANTS', 'DEPARTMENTS', 'USERS', 'VENDORS', 'COST_CENTERS', 'MASTERS', 'EMAIL_REPORT_CONFIG', 'LOG_TEMPLATE_CONFIG', 'ESG_CONFIG', 'SAFETY_CONFIG']) {
    if (MASTER_MODULES.includes(moduleKey as any)) {
      permissions.ESG_ADMIN[moduleKey] = ['READ'];
    }
  }

  // ============================
  // HR ADMIN — Org-scoped HR management
  // ============================
  permissions.HR_ADMIN = {};
  for (const moduleKey of OPERATION_MODULES) {
    if (['DASHBOARD', 'ASSETS', 'WORK_ORDERS', 'PM', 'CALIBRATION', 'AMC', 'INVENTORY', 'LOGS', 'REPORTS', 'NOTIFICATIONS', 'ALERTS'].includes(moduleKey)) {
      permissions.HR_ADMIN[moduleKey] = ['READ'];
    } else if (moduleKey === 'ESG') {
      permissions.HR_ADMIN[moduleKey] = ['READ'];
    } else {
      permissions.HR_ADMIN[moduleKey] = ['READ'];
    }
  }
  permissions.HR_ADMIN['GATES'] = [...ALL_ACTIONS]; // Full gate access
  permissions.HR_ADMIN['SECURITY'] = ['READ'];
  // HR master data
  permissions.HR_ADMIN['USERS'] = [...READ_CRUD_EXPORT];
  permissions.HR_ADMIN['SHIFTS'] = [...READ_CRUD_EXPORT];
  permissions.HR_ADMIN['GATE_CONFIG'] = [...READ_CRUD_EXPORT];
  permissions.HR_ADMIN['DEPARTMENTS'] = ['READ', 'UPDATE'];
  permissions.HR_ADMIN['LOG_TEMPLATE_CONFIG'] = ['READ', 'CREATE', 'UPDATE'];
  permissions.HR_ADMIN['MASTERS'] = ['READ'];

  // ============================
  // MAINTENANCE MANAGER — Full maintenance operations (no Dashboard)
  // ============================
  permissions.MAINTENANCE_MANAGER = {
    WORK_ORDERS: [...READ_CRUD_EXPORT_APPROVE, 'ASSIGN', 'CLOSE'],
    ASSETS: [...READ_CRUD],
    AMC: [...READ_CRUD],
    PM: [...READ_CRUD],
    CALIBRATION: [...READ_CRUD],
    ESG: ['READ'],
    INVENTORY: [...READ_CREATE_UPDATE, 'EXPORT'],
    REPORTS: [...READ_CREATE, 'EXPORT'],
    LOGS: [...READ_CRUD],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    DATA_LOGGING: ['READ'],
    BENCHMARKING: ['READ'],
    ANALYTICS: ['READ'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SECURITY: ['READ'],
    SAFETY: ['READ', 'CREATE', 'UPDATE'],
    // Master data
    PLANTS: ['READ'],
    DEPARTMENTS: [...READ_CRUD],
    MODULES: [...READ_CRUD],
    ASSETS_CONFIG: [...READ_CRUD],
    COST_CENTERS: ['READ'],
    VENDORS: ['READ'],
    USERS: ['READ'],
    SHIFTS: ['READ'],
    MAINTENANCE_TEAMS: [...READ_CRUD],
    WORK_ORDER_MASTERS: [...READ_CRUD],
    WORK_ORDER_TEAM_MAPPINGS: [...READ_CRUD],
    SLA_CONFIG: [...READ_CRUD],
    PM_CONFIG: [...READ_CRUD],
    CALIBRATION_CONFIG: [...READ_CRUD],
    CALIBRATION_TEMPLATES: [...READ_CRUD],
    CALIBRATION_SCHEDULES: [...READ_CRUD],
    CALIBRATION_INSTRUMENTS: [...READ_CRUD],
    AMC_CONFIG: [...READ_CRUD],
    EMAIL_REPORT_CONFIG: ['READ'],
    LOG_TEMPLATE_CONFIG: [...READ_CRUD],
    MACHINE_INSTRUMENT_CONFIG: [...READ_CRUD],
    MASTERS: ['READ'],
  };

  // ============================
  // MAINTENANCE USER — Maintenance tasks (no delete, no approve, no Dashboard)
  // ============================
  permissions.MAINTENANCE_USER = {
    WORK_ORDERS: [...READ_CREATE_UPDATE, 'CLOSE'],
    ASSETS: ['READ'],
    AMC: ['READ'],
    PM: ['READ'],
    CALIBRATION: [...READ_CREATE_UPDATE],
    ESG: ['READ'],
    INVENTORY: [...READ_CREATE_UPDATE],
    REPORTS: ['READ', 'EXPORT'],
    LOGS: [...READ_CREATE_UPDATE],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SECURITY: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    MODULES: ['READ'],
    USERS: ['READ'],
    VENDORS: ['READ'],
    MASTERS: ['READ'],
    LOG_TEMPLATE_CONFIG: ['READ'],
    WORK_ORDER_MASTERS: ['READ'],
  };

  // ============================
  // PRODUCTION MANAGER — Production oversight (no Dashboard)
  // ============================
  permissions.PRODUCTION_MANAGER = {
    WORK_ORDERS: [...READ_CREATE_UPDATE, 'APPROVE'],
    ASSETS: ['READ'],
    REPORTS: ['READ', 'EXPORT'],
    LOGS: [...READ_CRUD],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SECURITY: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    USERS: ['READ'],
    MASTERS: ['READ'],
    LOG_TEMPLATE_CONFIG: ['READ'],
  };

  // ============================
  // PRODUCTION USER — Basic production access (no Dashboard)
  // ============================
  permissions.PRODUCTION_USER = {
    WORK_ORDERS: ['READ', 'CREATE'],
    ASSETS: ['READ'],
    REPORTS: ['READ'],
    LOGS: [...READ_CREATE_UPDATE],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    USERS: ['READ'],
  };

  // ============================
  // SCM MANAGER — Supply chain operations (no Dashboard)
  // ============================
  permissions.SCM_MANAGER = {
    WORK_ORDERS: ['READ'],
    ASSETS: ['READ'],
    AMC: [...READ_CRUD],
    PM: ['READ'],
    INVENTORY: [...READ_CRUD_EXPORT],
    REPORTS: [...READ_CREATE, 'EXPORT'],
    LOGS: ['READ'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    VENDORS: [...READ_CRUD],
    COST_CENTERS: [...READ_CRUD],
    AMC_CONFIG: [...READ_CRUD],
    LOG_TEMPLATE_CONFIG: [...READ_CRUD],
    MASTERS: ['READ'],
  };

  // ============================
  // SCM USER — Supply chain execution
  // ============================
  permissions.SCM_USER = {
    WORK_ORDERS: ['READ'],
    ASSETS: ['READ'],
    AMC: ['READ'],
    INVENTORY: [...READ_CREATE_UPDATE],
    LOGS: ['READ'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    VENDORS: ['READ'],
    COST_CENTERS: ['READ'],
  };

  // ============================
  // HR MANAGER — Plant-scoped HR (no Dashboard)
  // ============================
  permissions.HR_MANAGER = {
    WORK_ORDERS: ['READ'],
    ASSETS: ['READ'],
    LOGS: ['READ'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: [...READ_CREATE_UPDATE, 'EXPORT'],
    VISITOR_EXPERIENCE: ['READ'],
    SECURITY: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    USERS: [...READ_CREATE_UPDATE],
    SHIFTS: [...READ_CRUD],
    GATE_CONFIG: [...READ_CRUD],
    LOG_TEMPLATE_CONFIG: ['READ'],
    MASTERS: ['READ'],
  };

  // ============================
  // HR USER — HR operations
  // ============================
  permissions.HR_USER = {
    WORK_ORDERS: ['READ'],
    LOGS: ['READ'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: [...READ_CREATE_UPDATE],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    USERS: ['READ'],
    SHIFTS: ['READ'],
  };

  // ============================
  // CALIBRATION MANAGER — Calibration oversight (no Dashboard)
  // ============================
  permissions.CALIBRATION_MANAGER = {
    WORK_ORDERS: ['READ'],
    ASSETS: ['READ'],
    CALIBRATION: [...READ_CRUD_EXPORT],
    REPORTS: ['READ', 'EXPORT'],
    LOGS: ['READ'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    CALIBRATION_CONFIG: [...READ_CRUD],
    CALIBRATION_TEMPLATES: [...READ_CRUD],
    CALIBRATION_SCHEDULES: [...READ_CRUD],
    CALIBRATION_INSTRUMENTS: [...READ_CRUD],
    MACHINE_INSTRUMENT_CONFIG: [...READ_CRUD],
    MASTERS: ['READ'],
  };

  // ============================
  // CALIBRATION USER — Calibration execution
  // ============================
  permissions.CALIBRATION_USER = {
    CALIBRATION: [...READ_CREATE_UPDATE],
    REPORTS: ['READ'],
    LOGS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
  };

  // ============================
  // ACCOUNTS MANAGER — Financial management (no Dashboard)
  // ============================
  permissions.ACCOUNTS_MANAGER = {
    WORK_ORDERS: ['READ'],
    ASSETS: ['READ'],
    REPORTS: ['READ', 'EXPORT'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    COST_CENTERS: [...READ_CRUD],
    VENDORS: [...READ_CRUD],
    LOG_TEMPLATE_CONFIG: ['READ'],
    MASTERS: ['READ'],
  };

  // ============================
  // ACCOUNTS USER — Financial execution
  // ============================
  permissions.ACCOUNTS_USER = {
    WORK_ORDERS: ['READ'],
    LOGS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    COST_CENTERS: ['READ'],
    VENDORS: ['READ'],
  };

  // ============================
  // SAFETY MANAGER — Safety oversight (no Dashboard)
  // ============================
  permissions.SAFETY_MANAGER = {
    SAFETY: [...READ_CRUD_EXPORT],
    WORK_ORDERS: ['READ'],
    ASSETS: ['READ'],
    LOGS: ['READ'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ', 'UPDATE'],
    VISITOR_EXPERIENCE: ['READ'],
    SECURITY: ['READ'],
    ESG: ['READ'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    USERS: ['READ'],
    SAFETY_CONFIG: [...READ_CRUD],
    LOG_TEMPLATE_CONFIG: ['READ'],
    MASTERS: ['READ'],
  };

  // ============================
  // SAFETY USER — Safety execution (no Dashboard)
  // ============================
  permissions.SAFETY_USER = {
    SAFETY: [...READ_CREATE_UPDATE],
    LOGS: ['READ'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    ESG: ['READ'],
    PLANTS: ['READ'],
  };

  // ============================
  // ESG MANAGER — Plant-scoped ESG (no Dashboard)
  // ============================
  permissions.ESG_MANAGER = {
    ESG: [...READ_CRUD_EXPORT],
    REPORTS: ['READ', 'EXPORT'],
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
    DEPARTMENTS: ['READ'],
    USERS: ['READ'],
    ESG_CONFIG: [...READ_CRUD],
    LOG_TEMPLATE_CONFIG: ['READ'],
    MASTERS: ['READ'],
  };

  // ============================
  // ESG USER — ESG execution
  // ============================
  permissions.ESG_USER = {
    ESG: [...READ_CREATE_UPDATE],
    REPORTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SAFETY: ['READ', 'CREATE'],
    PLANTS: ['READ'],
  };

  // ============================
  // VENDOR — AMC-only (close assigned WOs)
  // ============================
  permissions.VENDOR = {
    AMC: ['READ'],
    WORK_ORDERS: ['CLOSE'],
    VISITOR_EXPERIENCE: ['READ'],
  };

  // ============================
  // SECURITY — Gate-only
  // ============================
  permissions.SECURITY = {
    GATES: [...ALL_ACTIONS],
    VISITOR_EXPERIENCE: ['READ'],
  };

  // ============================
  // VISITOR — Visitor page only
  // ============================
  permissions.VISITOR = {
    VISITOR_EXPERIENCE: ['READ'],
  };

  return permissions;
}

/** The authoritative role-to-permissions map */
const ROLE_PERMISSIONS = defineRolePermissions();

// ============================================================================
// PERMISSION INHERITANCE RESOLVER
// ============================================================================

/**
 * Get the effective permission map for a role, walking the inheritance chain.
 * 
 * Inheritance rules:
 * - A manager inherits all permissions from their user role
 * - More specific permissions in the child override parent
 * - Admin roles inherit from manager roles they supervise
 * 
 * Uses the INHERITANCE_CHAIN defined in enterprise-roles.ts for authoritative
 * hierarchy traversal.
 */
export function getEffectivePermissions(roleKey: string): PermissionMap {
  const canonical = resolveCanonicalRoleKey(roleKey);
  const inherited: PermissionMap = {};

  // Walk up the inheritance chain using the authoritative hierarchy from enterprise-roles.ts
  const chainRoles = walkInheritanceUp(canonical);

  // Merge permissions from all roles in the chain (starting from lowest priority)
  for (const roleKey of chainRoles) {
    const perms = ROLE_PERMISSIONS[roleKey];
    if (!perms) continue;
    for (const [moduleKey, actions] of Object.entries(perms)) {
      if (!inherited[moduleKey]) {
        inherited[moduleKey] = [...actions];
      } else {
        // Merge: add new actions not already present
        const existing = new Set(inherited[moduleKey]);
        for (const action of actions) {
          if (!existing.has(action)) {
            inherited[moduleKey].push(action);
          }
        }
      }
    }
  }

  return inherited;
}

// ============================================================================
// PERMISSION CHECK
// ============================================================================

/**
 * Check if a user is a root admin.
 */
export function isRootAdmin(auth: Pick<AuthContext, 'roleKey' | 'roles'>): boolean {
  const roleKey = resolveCanonicalRoleKey(auth.roleKey ?? '');
  if (roleKey === 'ROOT_ADMIN') return true;
  return auth.roles.some((r) => resolveCanonicalRoleKey(r) === 'ROOT_ADMIN');
}

/**
 * Check if a user is a super admin or organization-scoped admin.
 */
export function isSuperAdmin(auth: Pick<AuthContext, 'roleKey' | 'roles'>): boolean {
  const roleKey = resolveCanonicalRoleKey(auth.roleKey ?? '');
  if (roleKey === 'SUPER_ADMIN') return true;
  return auth.roles.some((r) => resolveCanonicalRoleKey(r) === 'SUPER_ADMIN');
}

/**
 * Centralized permission check.
 * This is the SINGLE function to call for all authorization decisions.
 * 
 * @param auth - The authenticated user context
 * @param moduleId - The module key to check (e.g., 'WORK_ORDERS', 'ASSETS')
 * @param action - The action to check (e.g., 'READ', 'CREATE', 'UPDATE', 'DELETE')
 * @param options - Optional parameters
 * @returns PermissionDecision with allowed flag and details
 */
export function authorizePermission(
  auth: Pick<AuthContext, 'roleKey' | 'roles' | 'permissions'>,
  moduleId: string,
  action: string,
  options?: {
    /** Whether to skip DB-stored permission overrides and use only enterprise defaults */
    strict?: boolean;
  },
): PermissionDecision {
  const requestedAction = normalizeAction(action);
  const moduleKeys = resolveModuleKeys(moduleId);
  const canonicalRoleKey = resolveCanonicalRoleKey(auth.roleKey ?? '');
  const rootAdminAllowlist = new Set<string>([...GOVERNANCE_MODULES, 'SECURITY']);

  for (const moduleKey of moduleKeys) {
    const permissionKey = `${moduleKey}.${requestedAction}`;

    // ------------------------------------------------------------------
    // 1. ROOT ADMIN — Full access
    // ------------------------------------------------------------------
    if (isRootAdmin(auth)) {
      return { allowed: true, moduleKey, action: requestedAction, permissionKey };
    }

    // ------------------------------------------------------------------
    // 2. NOTIFICATIONS — All authenticated users can manage their own
    // ------------------------------------------------------------------
    if (moduleKey === 'NOTIFICATIONS' && ['READ', 'UPDATE', 'DELETE'].includes(requestedAction)) {
      return { allowed: true, moduleKey, action: requestedAction, permissionKey };
    }

    // ------------------------------------------------------------------
    // 3. VISITOR_EXPERIENCE — All authenticated users including visitors
    // ------------------------------------------------------------------
    if (moduleKey === 'VISITOR_EXPERIENCE' && requestedAction === 'READ') {
      return { allowed: true, moduleKey, action: requestedAction, permissionKey };
    }

    // ------------------------------------------------------------------
    // 4. Check DB-stored permissions first (supports custom roles)
    // ------------------------------------------------------------------
    if (!options?.strict && auth.permissions) {
      const storedActions = auth.permissions[moduleKey] ?? auth.permissions['*'] ?? [];
      const normalizedStored = storedActions.map((a) => normalizeAction(a));
      if (normalizedStored.includes(requestedAction) || normalizedStored.includes('*')) {
        return { allowed: true, moduleKey, action: requestedAction, permissionKey };
      }
    }

    // ------------------------------------------------------------------
    // 5. Enterprise role permission matrix (the authoritative source)
    // ------------------------------------------------------------------
    if (canonicalRoleKey && ROLE_PERMISSIONS[canonicalRoleKey]) {
      const effectivePerms = getEffectivePermissions(canonicalRoleKey);
      const roleActions = effectivePerms[moduleKey];
      if (roleActions && roleActions.includes(requestedAction)) {
        return { allowed: true, moduleKey, action: requestedAction, permissionKey };
      }
    }

    // ------------------------------------------------------------------
    // 6. Check all roles in the user's role list for permission
    // ------------------------------------------------------------------
    for (const role of auth.roles) {
      const canonical = resolveCanonicalRoleKey(role);
      if (canonical === canonicalRoleKey) continue; // Already checked
      const perms = ROLE_PERMISSIONS[canonical];
      if (!perms) continue;
      const effectivePerms = getEffectivePermissions(canonical);
      const roleActions = effectivePerms[moduleKey];
      if (roleActions && roleActions.includes(requestedAction)) {
        return { allowed: true, moduleKey, action: requestedAction, permissionKey };
      }
    }
  }

  const primaryModuleKey = moduleKeys[0] ?? normalizeModuleKey(moduleId);
  return {
    allowed: false,
    moduleKey: primaryModuleKey,
    action: requestedAction,
    permissionKey: `${primaryModuleKey}.${requestedAction}`,
    reason: 'PERMISSION_MISSING',
  };
}

/**
 * Convenience function to check if a user has a specific permission.
 * Returns true/false without detailed decision info.
 */
export function can(
  auth: Pick<AuthContext, 'roleKey' | 'roles' | 'permissions'>,
  moduleId: string,
  action: string,
): boolean {
  return authorizePermission(auth, moduleId, action).allowed;
}

/**
 * Check if user has ANY of the specified permissions.
 */
export function canAny(
  auth: Pick<AuthContext, 'roleKey' | 'roles' | 'permissions'>,
  requirements: Array<{ moduleId: string; action: string }>,
): boolean {
  return requirements.some((req) => can(auth, req.moduleId, req.action));
}

/**
 * Check if user has ALL of the specified permissions.
 */
export function canAll(
  auth: Pick<AuthContext, 'roleKey' | 'roles' | 'permissions'>,
  requirements: Array<{ moduleId: string; action: string }>,
): boolean {
  return requirements.every((req) => can(auth, req.moduleId, req.action));
}

// ============================================================================
// PERMISSION MAP BUILDING
// ============================================================================

/**
 * Build a permission map for a given role from the enterprise defaults.
 * Used when DB-stored permissions are empty (fallback).
 */
export function buildEnterprisePermissionMap(roleKey: string): PermissionMap {
  const canonical = resolveCanonicalRoleKey(roleKey);
  return getEffectivePermissions(canonical);
}

/**
 * Merge two permission maps. The source map's permissions take priority.
 */
export function mergePermissionMaps(
  base: PermissionMap,
  override: PermissionMap,
): PermissionMap {
  const result: PermissionMap = { ...base };
  for (const [moduleKey, actions] of Object.entries(override)) {
    const normalizedModule = normalizeModuleKey(moduleKey);
    const normalizedActions = actions.map((a) => normalizeAction(a));
    if (!result[normalizedModule]) {
      result[normalizedModule] = normalizedActions;
    } else {
      const existing = new Set(result[normalizedModule]);
      for (const action of normalizedActions) {
        existing.add(action);
      }
      result[normalizedModule] = Array.from(existing);
    }
  }
  return result;
}
