import type { ScopeType } from '../utils/rbac';

export type AppRole =
  | 'SUPER_ADMIN'
  | 'ROOT_ADMIN'
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
  | 'VISITOR'
  | 'SECURITY';

export interface AuthContext {
  userId: string;
  email: string;
  roles: string[];
  roleKey: string;
  rolePrecedence: number;
  scopeType?: ScopeType;
  organizationId?: string | null;
  orgRoleId?: string | null;
  department?: string | null;
  teamIds?: string[];
  plantIds: string[];
  activePlantId?: string | null;
  permissions: Record<string, string[]>;
  accessAllPlants: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  plantIds: string[];
  permissions?: Record<string, string[]>;
  accessAllPlants?: boolean;
  iat?: number;
  exp?: number;
}
