import 'express';
import type { ScopeType } from '../utils/rbac';

declare global {
  namespace Express {
    interface AuthContext {
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
      permissions: Record<string, string[]>;
      plantIds: string[];
      activePlantId?: string | null;
      accessAllPlants: boolean;
    }

    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
