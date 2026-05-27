// ============================================================================
// Enterprise RBAC Role Definitions
// ============================================================================
// This is the single source of truth for ALL enterprise roles in the CMMS/EAM
// platform. Every role, its hierarchy position, scope, and permissions are
// defined here. DO NOT hardcode role checks elsewhere in the codebase.
//
// Architecture:
//   ROOT_ADMIN → SUPER_ADMIN → PLANT_ADMIN → MANAGERS → USERS
//
// Special isolated roles:
//   VENDOR (AMC-scoped only), SECURITY (Gate-scoped only), VISITOR (Visitor-scoped only)
// ============================================================================

export type RoleScope = 'PLATFORM' | 'ORGANIZATION' | 'PLANT' | 'ASSIGNED';
export type RoleLevel = 'SYSTEM' | 'ROOT' | 'ADMIN' | 'MANAGER' | 'USER' | 'SPECIAL';

export interface RoleDefinition {
  /** Canonical role key (e.g., 'MAINTENANCE_MANAGER') */
  key: string;
  /** Human-readable display name */
  name: string;
  /** Description of role responsibilities */
  description: string;
  /** Numeric precedence — higher = more privileged (ROOT_ADMIN=1000, VISITOR=100) */
  precedence: number;
  /** Hierarchical level for grouping */
  level: RoleLevel;
  /** Data access scope */
  scope: RoleScope;
  /** Whether this is a system-managed role (cannot be deleted/renamed) */
  isSystem: boolean;
  /** Whether this is a special isolated role (VENDOR, SECURITY, VISITOR) */
  isSpecial: boolean;
  /** Parent roles for permission inheritance (higher-precedence roles) */
  parents: string[];
  /** Whether the role is active */
  isActive: boolean;
}

// ============================================================================
// ROLE CATALOG
// ============================================================================

export const ENTERPRISE_ROLES: Record<string, RoleDefinition> = {
  // --------------------------------------------------------------------------
  // ROOT LEVEL — Platform Governance
  // --------------------------------------------------------------------------
  ROOT_ADMIN: {
    key: 'ROOT_ADMIN',
    name: 'Root Admin',
    description: 'Platform governance — manages organizations, system config, global settings, and platform health',
    precedence: 1000,
    level: 'ROOT',
    scope: 'PLATFORM',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // ADMIN LEVEL — Organization-wide (SUPER_ADMIN) or Organization-scoped
  // --------------------------------------------------------------------------
  SUPER_ADMIN: {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Organization-wide administration — manages all plants, org-level resources, and operational oversight',
    precedence: 900,
    level: 'ADMIN',
    scope: 'ORGANIZATION',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  PLANT_ADMIN: {
    key: 'PLANT_ADMIN',
    name: 'Plant Admin',
    description: 'Plant-level administration — manages all resources, master data, and operations within a single plant',
    precedence: 800,
    level: 'ADMIN',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  ESG_ADMIN: {
    key: 'ESG_ADMIN',
    name: 'ESG Admin',
    description: 'Organization-wide ESG administration — manages ESG reporting, sustainability metrics, and compliance',
    precedence: 750,
    level: 'ADMIN',
    scope: 'ORGANIZATION',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  HR_ADMIN: {
    key: 'HR_ADMIN',
    name: 'HR Admin',
    description: 'Organization-wide HR administration — manages users, shifts, and HR master data across plants',
    precedence: 720,
    level: 'ADMIN',
    scope: 'ORGANIZATION',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // MANAGER LEVEL — Plant-specific functional managers
  // --------------------------------------------------------------------------
  MAINTENANCE_MANAGER: {
    key: 'MAINTENANCE_MANAGER',
    name: 'Maintenance Manager',
    description: 'Manages all maintenance operations — work orders, assets, PM/PD, calibration, AMC, spare parts, and maintenance teams',
    precedence: 680,
    level: 'MANAGER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: ['MAINTENANCE_USER'],
    isActive: true,
  },

  PRODUCTION_MANAGER: {
    key: 'PRODUCTION_MANAGER',
    name: 'Production Manager',
    description: 'Manages production operations — production assets, work orders, and dashboards',
    precedence: 650,
    level: 'MANAGER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: ['PRODUCTION_USER'],
    isActive: true,
  },

  SCM_MANAGER: {
    key: 'SCM_MANAGER',
    name: 'SCM Manager',
    description: 'Manages supply chain operations — inventory, vendors, AMC contracts, and spares',
    precedence: 640,
    level: 'MANAGER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: ['SCM_USER'],
    isActive: true,
  },

  HR_MANAGER: {
    key: 'HR_MANAGER',
    name: 'HR Manager',
    description: 'Manages HR operations — users, shifts, gate access, and HR-related master data',
    precedence: 630,
    level: 'MANAGER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: ['HR_USER'],
    isActive: true,
  },

  CALIBRATION_MANAGER: {
    key: 'CALIBRATION_MANAGER',
    name: 'Calibration Manager',
    description: 'Manages calibration operations — calibration schedules, instruments, and records',
    precedence: 620,
    level: 'MANAGER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: ['CALIBRATION_USER'],
    isActive: true,
  },

  ACCOUNTS_MANAGER: {
    key: 'ACCOUNTS_MANAGER',
    name: 'Accounts Manager',
    description: 'Manages financial operations — cost centers, vendor accounts, and financial reports',
    precedence: 610,
    level: 'MANAGER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: ['ACCOUNTS_USER'],
    isActive: true,
  },

  SAFETY_MANAGER: {
    key: 'SAFETY_MANAGER',
    name: 'Safety Manager',
    description: 'Manages safety operations — safety incidents, audits, training, and compliance',
    precedence: 600,
    level: 'MANAGER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: ['SAFETY_USER'],
    isActive: true,
  },

  ESG_MANAGER: {
    key: 'ESG_MANAGER',
    name: 'ESG Manager',
    description: 'Manages ESG operations — sustainability metrics, ESG data collection, and reporting',
    precedence: 590,
    level: 'MANAGER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: ['ESG_USER'],
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // USER LEVEL — Plant-specific functional users
  // --------------------------------------------------------------------------
  MAINTENANCE_USER: {
    key: 'MAINTENANCE_USER',
    name: 'Maintenance User',
    description: 'Executes maintenance tasks — creates/updates work orders, logs activities, views assets and PM schedules',
    precedence: 480,
    level: 'USER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  PRODUCTION_USER: {
    key: 'PRODUCTION_USER',
    name: 'Production User',
    description: 'Views production dashboards, work orders, and assets; can create basic work requests',
    precedence: 450,
    level: 'USER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  SCM_USER: {
    key: 'SCM_USER',
    name: 'SCM User',
    description: 'Manages inventory transactions, vendor interactions, and supply chain operations',
    precedence: 440,
    level: 'USER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  HR_USER: {
    key: 'HR_USER',
    name: 'HR User',
    description: 'Manages HR tasks — user records, shift schedules, and gate entry operations',
    precedence: 430,
    level: 'USER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  CALIBRATION_USER: {
    key: 'CALIBRATION_USER',
    name: 'Calibration User',
    description: 'Executes calibration tasks — performs calibrations, logs results, views calibration schedules',
    precedence: 420,
    level: 'USER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  ACCOUNTS_USER: {
    key: 'ACCOUNTS_USER',
    name: 'Accounts User',
    description: 'Handles financial data entry — cost center tracking, vendor invoices, and basic financial records',
    precedence: 410,
    level: 'USER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  SAFETY_USER: {
    key: 'SAFETY_USER',
    name: 'Safety User',
    description: 'Logs safety incidents, participates in audits, and views safety compliance data',
    precedence: 400,
    level: 'USER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  ESG_USER: {
    key: 'ESG_USER',
    name: 'ESG User',
    description: 'Collects and enters ESG data, views sustainability dashboards and reports',
    precedence: 390,
    level: 'USER',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: false,
    parents: [],
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // SPECIAL LEVEL — Isolated scoped roles
  // --------------------------------------------------------------------------
  VENDOR: {
    key: 'VENDOR',
    name: 'Vendor',
    description: 'External vendor — can only view and close assigned AMC work orders',
    precedence: 200,
    level: 'SPECIAL',
    scope: 'ASSIGNED',
    isSystem: true,
    isSpecial: true,
    parents: [],
    isActive: true,
  },

  SECURITY: {
    key: 'SECURITY',
    name: 'Security',
    description: 'Security personnel — manages gate entry, visitor logs, and security checkpoints',
    precedence: 150,
    level: 'SPECIAL',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: true,
    parents: [],
    isActive: true,
  },

  VISITOR: {
    key: 'VISITOR',
    name: 'Visitor',
    description: 'External visitor — limited to visitor experience page and digital pass only',
    precedence: 100,
    level: 'SPECIAL',
    scope: 'PLANT',
    isSystem: true,
    isSpecial: true,
    parents: [],
    isActive: true,
  },
};

// ============================================================================
// ROLE HIERARCHY CONSTANTS
// ============================================================================

/** Roles that inherit from their parent roles */
export const INHERITANCE_CHAIN: Record<string, string[]> = {
  ROOT_ADMIN: ['SUPER_ADMIN', 'PLANT_ADMIN'],
  SUPER_ADMIN: ['PLANT_ADMIN'],
  PLANT_ADMIN: ['MAINTENANCE_MANAGER', 'PRODUCTION_MANAGER', 'SCM_MANAGER', 'HR_MANAGER', 'CALIBRATION_MANAGER', 'ACCOUNTS_MANAGER', 'SAFETY_MANAGER', 'ESG_MANAGER'],
  ESG_ADMIN: ['ESG_MANAGER'],
  HR_ADMIN: ['HR_MANAGER'],
  MAINTENANCE_MANAGER: ['MAINTENANCE_USER'],
  PRODUCTION_MANAGER: ['PRODUCTION_USER'],
  SCM_MANAGER: ['SCM_USER'],
  HR_MANAGER: ['HR_USER'],
  CALIBRATION_MANAGER: ['CALIBRATION_USER'],
  ACCOUNTS_MANAGER: ['ACCOUNTS_USER'],
  SAFETY_MANAGER: ['SAFETY_USER'],
  ESG_MANAGER: ['ESG_USER'],
};

/** Role keys that represent admin-level or above */
export const ADMIN_LEVEL_ROLES: ReadonlySet<string> = new Set([
  'ROOT_ADMIN',
  'SUPER_ADMIN',
  'PLANT_ADMIN',
  'ESG_ADMIN',
  'HR_ADMIN',
]);

/** Role keys that represent manager-level or above */
export const MANAGER_LEVEL_ROLES: ReadonlySet<string> = new Set([
  ...ADMIN_LEVEL_ROLES,
  'MAINTENANCE_MANAGER',
  'PRODUCTION_MANAGER',
  'SCM_MANAGER',
  'HR_MANAGER',
  'CALIBRATION_MANAGER',
  'ACCOUNTS_MANAGER',
  'SAFETY_MANAGER',
  'ESG_MANAGER',
]);

/** Role keys that are special isolated roles */
export const SPECIAL_ROLES: ReadonlySet<string> = new Set([
  'VENDOR',
  'SECURITY',
  'VISITOR',
]);

/** Role keys that are organization-scoped (not plant-restricted) */
export const ORGANIZATION_SCOPED_ROLES: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'ESG_ADMIN',
  'HR_ADMIN',
]);

/** Role keys that are platform-scoped */
export const PLATFORM_SCOPED_ROLES: ReadonlySet<string> = new Set([
  'ROOT_ADMIN',
]);

// ============================================================================
// HELPERS
// ============================================================================

const LEGACY_ROLE_MAP: Record<string, string> = {
  'ADMIN': 'PLANT_ADMIN',
  'NORMAL_USER': 'MAINTENANCE_USER',
  'MECHANICAL_INCHARGE': 'MAINTENANCE_MANAGER',
  'ELECTRICAL_INCHARGE': 'MAINTENANCE_MANAGER',
  'UTILITY_INCHARGE': 'MAINTENANCE_MANAGER',
  'TOOLCHANGE_INCHARGE': 'MAINTENANCE_MANAGER',
  'CALIBRATION_INCHARGE': 'CALIBRATION_MANAGER',
  'SUPERADMIN': 'SUPER_ADMIN',
  'PLANTADMIN': 'PLANT_ADMIN',
};

/** Get the normalized canonical role key from any variant */
export function resolveCanonicalRoleKey(input: string): string {
  const trimmed = input.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return LEGACY_ROLE_MAP[trimmed] || trimmed;
}

/** Check if a role key exists in the enterprise definition */
export function isValidEnterpriseRole(key: string): boolean {
  return key in ENTERPRISE_ROLES;
}

/** Get all roles that inherit from the given role (upward chain) */
export function getInheritanceParents(roleKey: string): string[] {
  const canonical = resolveCanonicalRoleKey(roleKey);
  return INHERITANCE_CHAIN[canonical] ?? [];
}

/** Get all descendant roles that inherit from the given role (downward chain) */
export function getInheritanceDescendants(roleKey: string): string[] {
  const canonical = resolveCanonicalRoleKey(roleKey);
  return Object.entries(INHERITANCE_CHAIN)
    .filter(([, parents]) => parents.includes(canonical))
    .map(([child]) => child);
}
