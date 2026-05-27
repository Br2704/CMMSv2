// ===================================================================
// FRONTEND PERMISSION ENGINE — Centralized RBAC Authority
// ===================================================================
// This is the single source of truth for all frontend permission
// logic. Every store, hook, guard, and component delegates here.
// Mirrors the backend engine (backend/src/services/permission-engine.ts)
// and configs (backend/src/config/enterprise-roles.ts,
// backend/src/config/permission-modules.ts).
// ===================================================================

// -------------------------------------------------------------------
// 1. MODULE KEYS & ACTIONS
// -------------------------------------------------------------------

export const RBAC_ACTIONS = [
  'READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT',
  'APPROVE', 'ASSIGN', 'REJECT', 'CLOSE', 'IMPORT',
] as const;
export type RbacAction = (typeof RBAC_ACTIONS)[number];

export const ALL_ACTIONS = [...RBAC_ACTIONS] as string[];

export const OPERATION_MODULES = [
  'DASHBOARD', 'WORK_ORDERS', 'ASSETS', 'AMC', 'PM',
  'CALIBRATION', 'ESG', 'INVENTORY', 'REPORTS', 'LOGS',
] as const;

export const GATE_MODULES = ['GATES', 'VISITOR_EXPERIENCE'] as const;

export const SECURITY_MODULES = ['SECURITY_CENTER'] as const;

export const MASTER_MODULES = [
  'PLANTS', 'DEPARTMENTS', 'MODULES', 'VENDORS', 'USERS',
  'SHIFTS', 'MAINTENANCE_TEAMS', 'WORK_ORDER_MASTERS',
  'COST_CENTERS',
] as const;

export const GOVERNANCE_MODULES = [
  'ORGANIZATIONS', 'ROLE_ACCESS', 'SYSTEM_CONFIG',
  'MAIL_CONFIG', 'REPORT_FORMAT', 'BACKUP',
] as const;

/** All standard RBAC module keys (excluding root governance) */
export const RBAC_MODULE_KEYS = [
  ...OPERATION_MODULES, ...GATE_MODULES, ...SECURITY_MODULES,
  ...MASTER_MODULES,
] as const;

// -------------------------------------------------------------------
// 2. MODULE ALIAS MAPPING
// -------------------------------------------------------------------

export const MODULE_ALIASES: Record<string, string> = {
  VIEW: 'READ',
  ADD: 'CREATE',
  EDIT: 'UPDATE',
  REMOVE: 'DELETE',
  DASHBOARD: 'DASHBOARD',
  WORKORDERS: 'WORK_ORDERS',
  WO: 'WORK_ORDERS',
  ASSET: 'ASSETS',
  PMPD: 'PM',
  'PM/PD': 'PM',
  'PREVENTIVE_MAINTENANCE': 'PM',
  CALIB: 'CALIBRATION',
  SPARE: 'INVENTORY',
  'SPARE_MAINTENANCE': 'INVENTORY',
  'SECURITY_GATE': 'GATES',
  'GATE_ENTRY': 'GATES',
  'VISITOR_EXP': 'VISITOR_EXPERIENCE',
  'VISITOR': 'VISITOR_EXPERIENCE',
  'SECURITY_CENTRE': 'SECURITY_CENTER',
  'SECURITY': 'SECURITY_CENTER',
  AUDIT: 'SECURITY_CENTER',
  AUDIT_LOGS: 'SECURITY_CENTER',
  DEPT: 'DEPARTMENTS',
  DEPARTMENT: 'DEPARTMENTS',
  'COST_CENTER': 'COST_CENTERS',
  VENDOR: 'VENDORS',
  USER: 'USERS',
  ORG: 'ORGANIZATIONS',
  ORGANIZATION: 'ORGANIZATIONS',
  'ROLE_ACCESS': 'ROLE_ACCESS',
  'ROLE': 'ROLE_ACCESS',
  BENCHMARKING: 'REPORTS',
  INSIGHTS: 'REPORTS',
  DIAGNOSTICS: 'REPORTS',
  ANALYTICS: 'REPORTS',
  NOTIFICATIONS: 'NOTIFICATIONS',
  ALERTS: 'NOTIFICATIONS',
  FACTORY: 'ASSETS',
  MACHINE: 'ASSETS',
  DATA_LOGGING: 'LOGS',
  SHIFT: 'SHIFTS',
  'WORK_ORDER_CONFIG': 'WORK_ORDER_MASTERS',
  'WO_CONFIG': 'WORK_ORDER_MASTERS',
  'PM_SCHEDULES': 'PM',
  'ESG': 'ESG',
  'SAFETY': 'SAFETY',
  'MACHINE_INSTRUMENTS': 'CALIBRATION',
  'AMC': 'AMC',
  'SLM': 'WORK_ORDER_MASTERS',
  'SLA': 'WORK_ORDER_MASTERS',
};

// -------------------------------------------------------------------
// 3. FEATURE-TO-MODULE MAPPING
// -------------------------------------------------------------------

export const FEATURE_BY_MODULE: Record<string, string> = {
  safety: 'SAFETY',
  esg: 'ESG',
  'security-gate': 'GATE_ENTRY',
  'visitor-experience': 'GATE_ENTRY',
  'masters.safety-config': 'SAFETY',
  'masters.esg-config': 'ESG',
  'masters.gates': 'GATE_ENTRY',
  benchmarking: 'ADVANCED_ANALYTICS',
  'performance-logs': 'ADVANCED_ANALYTICS',
  insights: 'ADVANCED_ANALYTICS',
  diagnostics: 'ADVANCED_ANALYTICS',
};

// -------------------------------------------------------------------
// 4. CANONICAL ROLE DEFINITIONS
// -------------------------------------------------------------------

export type CanonicalRole =
  | 'ROOT_ADMIN'
  | 'SUPER_ADMIN'
  | 'PLANT_ADMIN'
  | 'ESG_ADMIN'
  | 'HR_ADMIN'
  | 'MAINTENANCE_MANAGER'
  | 'PRODUCTION_MANAGER'
  | 'SCM_MANAGER'
  | 'HR_MANAGER'
  | 'CALIBRATION_MANAGER'
  | 'ACCOUNTS_MANAGER'
  | 'SAFETY_MANAGER'
  | 'ESG_MANAGER'
  | 'MAINTENANCE_USER'
  | 'PRODUCTION_USER'
  | 'SCM_USER'
  | 'HR_USER'
  | 'CALIBRATION_USER'
  | 'ACCOUNTS_USER'
  | 'SAFETY_USER'
  | 'ESG_USER'
  | 'VENDOR'
  | 'SECURITY'
  | 'VISITOR';

/** Precedence of each role (higher = more privileged) */
export const ROLE_PRECEDENCE: Record<string, number> = {
  ROOT_ADMIN: 500,
  SUPER_ADMIN: 400,
  PLANT_ADMIN: 300,
  ESG_ADMIN: 280,
  HR_ADMIN: 270,
  MAINTENANCE_MANAGER: 250,
  PRODUCTION_MANAGER: 240,
  SCM_MANAGER: 235,
  HR_MANAGER: 230,
  CALIBRATION_MANAGER: 225,
  ACCOUNTS_MANAGER: 220,
  SAFETY_MANAGER: 215,
  ESG_MANAGER: 210,
  MAINTENANCE_USER: 200,
  PRODUCTION_USER: 195,
  SCM_USER: 190,
  HR_USER: 185,
  CALIBRATION_USER: 180,
  ACCOUNTS_USER: 175,
  SAFETY_USER: 170,
  ESG_USER: 165,
  VENDOR: 150,
  SECURITY: 100,
  VISITOR: 50,
};

/** Role inheritance — each role inherits permissions from its parents */
export const INHERITANCE_CHAIN: Record<string, string[]> = {
  ROOT_ADMIN: ['SUPER_ADMIN'],
  SUPER_ADMIN: ['PLANT_ADMIN'],
  ESG_ADMIN: ['ESG_MANAGER'],
  HR_ADMIN: ['HR_MANAGER'],
  PLANT_ADMIN: [
    'MAINTENANCE_MANAGER', 'PRODUCTION_MANAGER', 'SCM_MANAGER',
    'HR_MANAGER', 'CALIBRATION_MANAGER', 'ACCOUNTS_MANAGER',
    'SAFETY_MANAGER', 'ESG_MANAGER',
  ],
  MAINTENANCE_MANAGER: ['MAINTENANCE_USER'],
  PRODUCTION_MANAGER: ['PRODUCTION_USER'],
  SCM_MANAGER: ['SCM_USER'],
  HR_MANAGER: ['HR_USER'],
  CALIBRATION_MANAGER: ['CALIBRATION_USER'],
  ACCOUNTS_MANAGER: ['ACCOUNTS_USER'],
  SAFETY_MANAGER: ['SAFETY_USER'],
  ESG_MANAGER: ['ESG_USER'],
  MAINTENANCE_USER: [],
  PRODUCTION_USER: [],
  SCM_USER: [],
  HR_USER: [],
  CALIBRATION_USER: [],
  ACCOUNTS_USER: [],
  SAFETY_USER: [],
  ESG_USER: [],
  VENDOR: [],
  SECURITY: [],
  VISITOR: [],
};

// -------------------------------------------------------------------
// 5. SCOPE TYPES
// -------------------------------------------------------------------

export type ScopeType = 'PLATFORM' | 'ORGANIZATION' | 'PLANT' | 'VENDOR' | 'SECURITY' | 'VISITOR';

export function resolveScopeType(role: string): ScopeType {
  const canonical = normalizeRole(role);
  if (canonical === 'ROOT_ADMIN') return 'PLATFORM';
  if (canonical === 'SUPER_ADMIN' || canonical === 'ESG_ADMIN' || canonical === 'HR_ADMIN') return 'ORGANIZATION';
  if (canonical === 'VENDOR') return 'VENDOR';
  if (canonical === 'SECURITY') return 'SECURITY';
  if (canonical === 'VISITOR') return 'VISITOR';
  return 'PLANT';
}

export function getPrimaryRole(roles: string[]): string {
  if (!roles || roles.length === 0) return 'MAINTENANCE_USER';
  const normalized = roles.map(normalizeRole).filter(Boolean);
  if (normalized.length === 0) return 'MAINTENANCE_USER';
  return normalized.sort((a, b) => (ROLE_PRECEDENCE[b] ?? 0) - (ROLE_PRECEDENCE[a] ?? 0))[0];
}

// -------------------------------------------------------------------
// 6. NORMALIZATION HELPERS
// -------------------------------------------------------------------

export function normalizeAction(action: string | null | undefined): string {
  const input = (action || '').trim().toUpperCase();
  if (MODULE_ALIASES[input]) return MODULE_ALIASES[input];
  return input;
}

export function normalizeModuleKey(moduleKey: string | null | undefined): string {
  const input = (moduleKey || '').trim().toUpperCase();
  if (MODULE_ALIASES[input]) return MODULE_ALIASES[input];
  return input;
}

export function normalizeRole(role: string | null | undefined): string {
  if (!role) return 'MAINTENANCE_USER';
  const normalized = role
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized;
}

export function resolveCanonicalRoleKey(role: string): string {
  return normalizeRole(role);
}

/** Walk the inheritance chain to get all ancestor roles */
export function walkInheritanceUp(role: string): string[] {
  const canonical = normalizeRole(role);
  const result: string[] = [canonical];
  const parents = INHERITANCE_CHAIN[canonical] ?? [];
  for (const parent of parents) {
    result.push(...walkInheritanceUp(parent));
  }
  return result;
}

// -------------------------------------------------------------------
// 7. PERMISSION CHECK
// -------------------------------------------------------------------

export function can(
  permissionMap: Record<string, string[]> | null | undefined,
  moduleId: string | null | undefined,
  action = 'READ',
): boolean {
  if (!permissionMap) return false;
  if (!moduleId) return false;

  const normalizedModule = normalizeModuleKey(moduleId);
  const normalizedAction = normalizeAction(action);

  const actions = [
    ...(permissionMap[normalizedModule] ?? []),
    ...(permissionMap['*'] ?? []),
  ].map((a) => a.toUpperCase());

  if (actions.includes('*')) return true;
  if (actions.includes(normalizedAction)) return true;
  if (normalizedAction === 'ASSIGN' && actions.includes('UPDATE')) return true;
  if (normalizedAction === 'REJECT' && actions.includes('APPROVE')) return true;

  return false;
}

export function hasRole(roles: string[], targetRole: string): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false;
  const canonicalTarget = normalizeRole(targetRole);
  return roles.some((r) => normalizeRole(r) === canonicalTarget);
}

export function isRootAdmin(roles: string[]): boolean {
  return hasRole(roles, 'ROOT_ADMIN');
}

export function isSuperAdmin(roles: string[]): boolean {
  return hasRole(roles, 'SUPER_ADMIN') || hasRole(roles, 'ROOT_ADMIN');
}

export function isPlantAdmin(roles: string[]): boolean {
  return hasRole(roles, 'PLANT_ADMIN');
}

export function isAdminLevel(roles: string[]): boolean {
  return isRootAdmin(roles) || isSuperAdmin(roles) || isPlantAdmin(roles);
}

export function isManagerLevel(roles: string[]): boolean {
  return isAdminLevel(roles) || (Array.isArray(roles) && roles.some((r) => normalizeRole(r).endsWith('_MANAGER')));
}

// -------------------------------------------------------------------
// 8. PERMISSION MAP BUILDERS
// -------------------------------------------------------------------

export function mergePermissionMaps(
  base: Record<string, string[]>,
  override: Record<string, string[]>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const allKeys = new Set([...Object.keys(base), ...Object.keys(override)]);
  for (const key of allKeys) {
    const baseActions = base[key] ?? [];
    const overrideActions = override[key] ?? [];
    result[key] = Array.from(new Set([...baseActions, ...overrideActions]));
  }
  return result;
}

/**
 * Build a full permission map for a given role, including inherited permissions.
 * Mirrors the backend's buildEnterprisePermissionMap logic, but simplified for
 * frontend use as a fallback when the backend permission map is not yet loaded.
 */
export function buildPermissionMapForRole(role: string): Record<string, string[]> {
  const canonical = normalizeRole(role);
  const inheritedRoles = walkInheritanceUp(canonical);

  let result: Record<string, string[]> = {};
  for (const r of inheritedRoles) {
    const rolePermissions = ROLE_PERMISSION_MATRIX[r] ?? {};
    result = mergePermissionMaps(result, rolePermissions);
  }
  return result;
}

// -------------------------------------------------------------------
// 9. ROLE PERMISSION MATRIX — mirrors backend permission-engine.ts
//    Defines minimum enterprise permissions for each canonical role.
// -------------------------------------------------------------------

const READ_ACTION = ['READ'];
const READ_UPDATE = ['READ', 'UPDATE'];
const READ_CREATE = ['READ', 'CREATE'];
const READ_CREATE_UPDATE = ['READ', 'CREATE', 'UPDATE'];
const READ_CRUD = ['READ', 'CREATE', 'UPDATE', 'DELETE'];
const READ_CRUD_EXPORT = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT'];
const READ_CRUD_EXPORT_APPROVE = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE'];

function defineRolePermissions(): Record<string, Record<string, string[]>> {
  const permissions: Record<string, Record<string, string[]>> = {};

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
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
    SECURITY: ['READ'],
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
    ALERTS: ['READ'],
    NOTIFICATIONS: ['READ', 'UPDATE'],
    GATES: ['READ'],
    VISITOR_EXPERIENCE: ['READ'],
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

export const ROLE_PERMISSION_MATRIX: Record<string, Record<string, string[]>> = defineRolePermissions();
