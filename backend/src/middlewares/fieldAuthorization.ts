import type { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/apiResponse';
import { normalizeRoleName } from '../utils/rbac';

type FieldRules = Record<string, string[]>;

function getActorRoles(req: Request) {
  return (req.auth?.roles ?? []).map((role) => normalizeRoleName(role));
}

export function forbidFieldsByRole(fieldRules: FieldRules) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      next();
      return;
    }

    const actorRoles = getActorRoles(req);
    const payload = req.body as Record<string, unknown>;
    const forbiddenFields = new Set<string>();

    for (const role of actorRoles) {
      (fieldRules[role] ?? []).forEach((field) => forbiddenFields.add(field));
    }

    const blocked = Array.from(forbiddenFields).filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
    if (blocked.length === 0) {
      next();
      return;
    }

    res.status(403).json(fail(`Forbidden fields for your role: ${blocked.join(', ')}`));
  };
}
