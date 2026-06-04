// ============================================================================
// Enterprise Permission Module Definitions
// ============================================================================
// This file defines ALL module keys, actions, and their page mappings for the
// CMMS/EAM platform. Every API route, page, and component must map to a module
// key defined here.
//
// Module Categories:
//   OPERATIONS   - Core business operations (work orders, assets, etc.)
//   GATES        - Gate & visitor management
//   SECURITY     - Security center & audit logs
//   MASTERS      - Master data configuration
//   GOVERNANCE   - Platform governance (org, users, roles)
// ============================================================================

/** Standard CRUD + workflow actions */
export const RBAC_ACTIONS = [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXPORT',
  'IMPORT',
  'APPROVE',
  'REJECT',
  'CLOSE',
  'ASSIGN',
] as const;

export type RbacAction = (typeof RBAC_ACTIONS)[number];

// ============================================================================
// MODULE KEY DEFINITIONS
// ============================================================================

/** All operational module keys */
export const OPERATION_MODULES = [
  'DASHBOARD',
  'WORK_ORDERS',
  'ASSETS',
  'AMC',
  'PM',
  'CALIBRATION',
  'ESG',
  'INVENTORY',
  'REPORTS',
  'LOGS',
  'ALERTS',
  'NOTIFICATIONS',
  'DATA_LOGGING',
  'BENCHMARKING',
  'ANALYTICS',
  'SAFETY',
] as const;

/** Gate-related module keys */
export const GATE_MODULES = [
  'GATES',
  'VISITOR_EXPERIENCE',
] as const;

/** Security module keys */
export const SECURITY_MODULES = [
  'SECURITY',
] as const;

/** Master data module keys */
export const MASTER_MODULES = [
  'PLANTS',
  'DEPARTMENTS',
  'MODULES',
  'ASSETS_CONFIG',
  'COST_CENTERS',
  'VENDORS',
  'USERS',
  'SHIFTS',
  'MAINTENANCE_TEAMS',
  'WORK_ORDER_MASTERS',
  'WORK_ORDER_TEAM_MAPPINGS',
  'SLA_CONFIG',
  'PM_CONFIG',
  'CALIBRATION_CONFIG',
  'CALIBRATION_TEMPLATES',
  'CALIBRATION_SCHEDULES',
  'CALIBRATION_INSTRUMENTS',
  'AMC_CONFIG',
  'ESG_CONFIG',
  'GATE_CONFIG',
  'SAFETY_CONFIG',
  'EMAIL_REPORT_CONFIG',
  'LOG_TEMPLATE_CONFIG',
  'MACHINE_INSTRUMENT_CONFIG',
  'MASTERS',
] as const;

/** Governance module keys */
export const GOVERNANCE_MODULES = [
  'ORGANIZATIONS',
  'ROLE_ACCESS',
  'SYSTEM_CONFIG',
  'MAIL_CONFIG',
  'REPORT_FORMAT',
  'FULL_SYSTEM_CONTROL',
] as const;

// ============================================================================
// MASTER MODULE CATEGORIZATION (for dynamic master page rendering)
// ============================================================================

export interface MasterModuleConfig {
  key: string;
  label: string;
  description: string;
  path: string;
  allowedRoles: string[];
  additionalRoles?: string[];
}

/** Master module configurations for sidebar/dynamic rendering */
export const MASTER_MODULE_CONFIGS: MasterModuleConfig[] = [
  {
    key: 'PLANTS',
    label: 'Plant Master',
    description: 'Manage plant configurations',
    path: '/masters/plant',
    allowedRoles: ['ROOT_ADMIN', 'SUPER_ADMIN', 'PLANT_ADMIN'],
    additionalRoles: ['MAINTENANCE_MANAGER', 'PRODUCTION_MANAGER', 'SCM_MANAGER', 'HR_MANAGER', 'CALIBRATION_MANAGER', 'ACCOUNTS_MANAGER', 'SAFETY_MANAGER', 'ESG_MANAGER'],
  },
  {
    key: 'DEPARTMENTS',
    label: 'Department Master',
    description: 'Manage departments',
    path: '/masters/departments',
    allowedRoles: ['PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'MODULES',
    label: 'Module Master',
    description: 'Manage machine modules',
    path: '/masters/modules',
    allowedRoles: ['PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'ASSETS_CONFIG',
    label: 'Machine Master',
    description: 'Manage machine/assets configuration',
    path: '/masters/machines',
    allowedRoles: ['PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'COST_CENTERS',
    label: 'Cost Center Master',
    description: 'Manage cost centers',
    path: '/masters/cost-centers',
    allowedRoles: ['PLANT_ADMIN', 'SUPER_ADMIN', 'SCM_MANAGER', 'ACCOUNTS_MANAGER'],
  },
  {
    key: 'VENDORS',
    label: 'Vendor Master',
    description: 'Manage vendors',
    path: '/masters/vendors',
    allowedRoles: ['PLANT_ADMIN', 'SUPER_ADMIN', 'SCM_MANAGER', 'ACCOUNTS_MANAGER'],
  },
  {
    key: 'USERS',
    label: 'User Master',
    description: 'Manage users',
    path: '/masters/users',
    allowedRoles: ['HR_ADMIN', 'HR_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'PM_CONFIG',
    label: 'PM/PD Master',
    description: 'Manage preventive/predictive maintenance schedules',
    path: '/masters/pm',
    allowedRoles: ['MAINTENANCE_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'CALIBRATION_CONFIG',
    label: 'Calibration Master',
    description: 'Manage calibration configurations',
    path: '/masters/calibration',
    allowedRoles: ['MAINTENANCE_MANAGER', 'CALIBRATION_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'AMC_CONFIG',
    label: 'AMC Master',
    description: 'Manage AMC contracts',
    path: '/masters/amc',
    allowedRoles: ['MAINTENANCE_MANAGER', 'SCM_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'GATE_CONFIG',
    label: 'Gate Master',
    description: 'Manage gate configurations',
    path: '/masters/gates',
    allowedRoles: ['HR_ADMIN', 'HR_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'SAFETY_CONFIG',
    label: 'Safety Master',
    description: 'Manage safety configurations',
    path: '/masters/safety',
    allowedRoles: ['SAFETY_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'EMAIL_REPORT_CONFIG',
    label: 'Email Report Master',
    description: 'Manage email report configurations',
    path: '/masters/email-report',
    allowedRoles: ['PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'LOG_TEMPLATE_CONFIG',
    label: 'Log Template Master',
    description: 'Manage log templates',
    path: '/masters/log-templates',
    allowedRoles: ['PLANT_ADMIN', 'SUPER_ADMIN', 'MAINTENANCE_MANAGER', 'PRODUCTION_MANAGER', 'SCM_MANAGER', 'HR_MANAGER', 'CALIBRATION_MANAGER', 'ACCOUNTS_MANAGER', 'SAFETY_MANAGER', 'ESG_MANAGER'],
  },
  {
    key: 'CALIBRATION_INSTRUMENTS',
    label: 'Machine Instruments Master',
    description: 'Manage calibration instruments',
    path: '/masters/calibration-instruments',
    allowedRoles: ['CALIBRATION_MANAGER', 'MAINTENANCE_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'SHIFTS',
    label: 'Shift Master',
    description: 'Manage shift schedules',
    path: '/masters/shifts',
    allowedRoles: ['HR_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'MAINTENANCE_TEAMS',
    label: 'Maintenance Team Master',
    description: 'Manage maintenance teams',
    path: '/masters/maintenance-teams',
    allowedRoles: ['MAINTENANCE_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'WORK_ORDER_MASTERS',
    label: 'WO Config Master',
    description: 'Manage work order configurations',
    path: '/masters/wo-config',
    allowedRoles: ['MAINTENANCE_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
  {
    key: 'SLA_CONFIG',
    label: 'SLA & Escalation Master',
    description: 'Manage SLA and escalation engine',
    path: '/masters/sla',
    allowedRoles: ['MAINTENANCE_MANAGER', 'PLANT_ADMIN', 'SUPER_ADMIN'],
  },
];

// ============================================================================
// ALL MODULE KEYS (aggregated)
// ============================================================================

export const RBAC_MODULE_KEYS = [
  ...OPERATION_MODULES,
  ...GATE_MODULES,
  ...SECURITY_MODULES,
  ...MASTER_MODULES,
  ...GOVERNANCE_MODULES,
] as const;

export type RbacModuleKey = (typeof RBAC_MODULE_KEYS)[number];

// ============================================================================
// MODULE ALIASES (for backward compatibility)
// ============================================================================

export const MODULE_ALIASES: Record<string, string> = {
  PM_SCHEDULES: 'PM',
  PMPD: 'PM',
  SECURITY_CENTER: 'SECURITY',
  AUDIT_LOGS: 'SECURITY',
  SPARE_MAINTENANCE: 'INVENTORY',
  MACHINE_MASTER: 'ASSETS_CONFIG',
  ASSETS: 'ASSETS',
  DATA_LOGGING: 'LOGS',
};

// ============================================================================
// NORMALIZATION HELPERS
// ============================================================================

/** Normalize module key to canonical form using alias resolution */
export function normalizeModuleKey(moduleKey: string): string {
  const normalized = moduleKey.trim().toUpperCase();
  return MODULE_ALIASES[normalized] ?? normalized;
}

/** Normalize action to canonical form */
export function normalizeAction(action: string): string {
  const input = action.trim().toUpperCase();
  const aliases: Record<string, string> = {
    VIEW: 'READ',
    ADD: 'CREATE',
    EDIT: 'UPDATE',
    REMOVE: 'DELETE',
    CANCEL: 'DELETE',
  };
  return aliases[input] ?? input;
}

// ============================================================================
// PAGE-TO-MODULE MAPPING
// ============================================================================

export interface PageModuleMapping {
  path: string;
  moduleKey: string;
  label: string;
  isRoot?: boolean;
}

export const PAGE_MODULE_MAP: PageModuleMapping[] = [
  // ---------- OPERATIONS ----------
  { path: '/dashboard', moduleKey: 'DASHBOARD', label: 'Dashboard' },
  { path: '/work-orders', moduleKey: 'WORK_ORDERS', label: 'Work Orders' },
  { path: '/assets', moduleKey: 'ASSETS', label: 'Assets' },
  { path: '/amc', moduleKey: 'AMC', label: 'AMC' },
  { path: '/pm', moduleKey: 'PM', label: 'PM/Schedule' },
  { path: '/calibration', moduleKey: 'CALIBRATION', label: 'Calibration' },
  { path: '/esg', moduleKey: 'ESG', label: 'ESG' },
  { path: '/inventory', moduleKey: 'INVENTORY', label: 'Spare Parts' },
  { path: '/reports', moduleKey: 'REPORTS', label: 'Reports' },
  { path: '/logs', moduleKey: 'LOGS', label: 'Logs' },
  { path: '/alerts', moduleKey: 'ALERTS', label: 'Alerts' },

  // ---------- GATES ----------
  { path: '/gates', moduleKey: 'GATES', label: 'Gate Entry' },
  { path: '/visitor-experience', moduleKey: 'VISITOR_EXPERIENCE', label: 'Visitor Experience' },

  // ---------- SECURITY ----------
  { path: '/security-center', moduleKey: 'SECURITY', label: 'Security Center' },

  // ---------- MASTERS ----------
  { path: '/masters', moduleKey: 'MASTERS', label: 'Masters Home' },
  { path: '/masters/plant', moduleKey: 'PLANTS', label: 'Plant Master' },
  { path: '/masters/departments', moduleKey: 'DEPARTMENTS', label: 'Department Master' },
  { path: '/masters/modules', moduleKey: 'MODULES', label: 'Module Master' },
  { path: '/masters/machines', moduleKey: 'ASSETS_CONFIG', label: 'Machine Master' },
  { path: '/masters/cost-centers', moduleKey: 'COST_CENTERS', label: 'Cost Center Master' },
  { path: '/masters/vendors', moduleKey: 'VENDORS', label: 'Vendor Master' },
  { path: '/masters/users', moduleKey: 'USERS', label: 'User Master' },
  { path: '/masters/pm', moduleKey: 'PM_CONFIG', label: 'PM Config Master' },
  { path: '/masters/calibration', moduleKey: 'CALIBRATION_CONFIG', label: 'Calibration Config Master' },
  { path: '/masters/amc', moduleKey: 'AMC_CONFIG', label: 'AMC Config Master' },
  { path: '/masters/gates', moduleKey: 'GATE_CONFIG', label: 'Gate Config Master' },
  { path: '/masters/safety', moduleKey: 'SAFETY_CONFIG', label: 'Safety Config Master' },
  { path: '/masters/email-report', moduleKey: 'EMAIL_REPORT_CONFIG', label: 'Email Report Master' },
  { path: '/masters/log-templates', moduleKey: 'LOG_TEMPLATE_CONFIG', label: 'Log Template Master' },
  { path: '/masters/calibration-instruments', moduleKey: 'CALIBRATION_INSTRUMENTS', label: 'Calibration Instruments' },
  { path: '/masters/shifts', moduleKey: 'SHIFTS', label: 'Shift Master' },
  { path: '/masters/maintenance-teams', moduleKey: 'MAINTENANCE_TEAMS', label: 'Maintenance Team Master' },
  { path: '/masters/wo-config', moduleKey: 'WORK_ORDER_MASTERS', label: 'WO Config Master' },
  { path: '/masters/sla', moduleKey: 'SLA_CONFIG', label: 'SLA Master' },

  // ---------- GOVERNANCE ----------
  { path: '/root/dashboard', moduleKey: 'DASHBOARD', label: 'Root Dashboard', isRoot: true },
  { path: '/root/organizations', moduleKey: 'ORGANIZATIONS', label: 'Organizations', isRoot: true },
  { path: '/root/users', moduleKey: 'USERS', label: 'Root Users', isRoot: true },
  { path: '/root/role-access', moduleKey: 'ROLE_ACCESS', label: 'Role Access', isRoot: true },
  { path: '/root/plant', moduleKey: 'PLANTS', label: 'Plant Master', isRoot: true },
  { path: '/root/system-config', moduleKey: 'SYSTEM_CONFIG', label: 'System Config', isRoot: true },
  { path: '/root/mail-config', moduleKey: 'MAIL_CONFIG', label: 'Mail Config', isRoot: true },
  { path: '/root/report-format', moduleKey: 'REPORT_FORMAT', label: 'Report Format', isRoot: true },
];
