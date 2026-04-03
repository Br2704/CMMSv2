export const APP_ROLES = ['SUPERADMIN', 'ROOT_ADMIN', 'ADMIN', 'USER'] as const;

export const MODULES = {
  plants: 'plants',
  users: 'users',
  roles: 'roles',
  permissions: 'permissions',
  assets: 'assets',
  workorders: 'workorders',
  pmpd: 'pmpd',
  calibration: 'calibration',
  amc: 'amc',
  vendors: 'masters.vendors',
  inventory: 'inventory',
  logs: 'logs',
  datalogging: 'data-logging',
  gates: 'security-gate',
  notifications: 'notifications',
  safety: 'safety',
  esg: 'esg',
  reports: 'masters.email-reports',
} as const;
