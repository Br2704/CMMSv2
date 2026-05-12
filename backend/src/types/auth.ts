import type { ScopeType } from '../utils/rbac';

export type AppRole =
  | 'SUPERADMIN'
  | 'SUPER_ADMIN'
  | 'ROOT_ADMIN'
  | 'ADMIN'
  | 'PLANT_ADMIN'
  | 'MAINTENANCE_MANAGER'
  | 'ENGINEER'
  | 'STORE_USER'
  | 'VIEWER'
  | 'VENDOR'
  | 'USER'
  | 'MECHANICAL_INCHARGE'
  | 'ELECTRICAL_INCHARGE'
  | 'UTILITY_INCHARGE'
  | 'TOOLCHANGE_INCHARGE'
  | 'CALIBRATION_INCHARGE'
  | 'TECHNICIAN'
  | 'OPERATOR';

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
