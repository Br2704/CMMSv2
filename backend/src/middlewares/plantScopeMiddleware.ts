import type { Request, Response, NextFunction } from 'express';
import { getActorPlantId, isGlobalRole } from '../utils/plantScope';

function applyScopedPlantToRequest(req: Request) {
  const auth = req.auth;
  if (!auth) {
    return;
  }

  if (isGlobalRole(auth.roleKey, auth.roles, auth.organizationId)) {
    return;
  }

  const actorPlantId = getActorPlantId(auth);
  const query = req.query as Record<string, unknown>;
  if (actorPlantId) {
    query.plantId = actorPlantId;
  } else {
    delete query.plantId;
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    const body = req.body as Record<string, unknown>;
    if (actorPlantId) {
      body.plantId = actorPlantId;
      body.plant_id = actorPlantId;
    } else {
      delete body.plantId;
      delete body.plant_id;
    }
  }
}

export function enforcePlantScopeMiddleware(req: Request, _res: Response, next: NextFunction) {
  applyScopedPlantToRequest(req);
  next();
}

export function enforcePlantScopeRequest(req: Request) {
  applyScopedPlantToRequest(req);
}
