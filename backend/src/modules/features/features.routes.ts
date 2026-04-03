import { Router } from 'express';
import { AppDataSource } from '../../database/data-source';
import { OrganizationFeatureEntity, PlantEntity, ProfileEntity, UserEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ok } from '../../utils/apiResponse';
import { normalizeRoleName } from '../../utils/rbac';
import { resolveUserOrganizationScope } from '../../utils/userOrganization';

const DEFAULT_FEATURES = {
  SAFETY: false,
  ESG: true,
  GATE_ENTRY: true,
  ADVANCED_ANALYTICS: false,
  HR: false,
} as const;

async function resolveOrganizationId(userId: string, authPlantIds: string[] = []) {
  const resolved = await resolveUserOrganizationScope({ userId, authPlantIds });
  return resolved.organizationId;
}

export const featuresRouter = Router();
featuresRouter.use(requireAuth);

featuresRouter.get('/features/me', async (req, res, next) => {
  try {
    const normalizedRoles = req.auth?.roles.map((role) => normalizeRoleName(role)) ?? [];
    const normalizedRoleKey = normalizeRoleName(req.auth?.roleKey ?? '');
    const isRootAdmin = normalizedRoleKey === 'ROOT_ADMIN' || normalizedRoles.includes('ROOT_ADMIN');

    if (isRootAdmin) {
      res.json(ok({ organizationId: null, enabled: [], features: {} }, 'Features fetched'));
      return;
    }

    const organizationId = await resolveOrganizationId(req.auth!.userId, req.auth?.plantIds ?? []);
    if (!organizationId) {
      res.json(ok({ organizationId: null, enabled: [], features: {} }, 'Features fetched'));
      return;
    }

    const rows = await AppDataSource.getRepository(OrganizationFeatureEntity).find({
      where: { organizationId },
      order: { featureKey: 'ASC' },
    });

    const features = Object.fromEntries(rows.map((row) => [row.featureKey, row.enabled]));
    Object.entries(DEFAULT_FEATURES).forEach(([featureKey, enabled]) => {
      if (!(featureKey in features)) {
        features[featureKey] = enabled;
      }
    });

    const enabled = Object.entries(features)
      .filter(([, value]) => value === true)
      .map(([featureKey]) => featureKey);

    res.json(ok({ organizationId, enabled, features }, 'Features fetched'));
  } catch (error) {
    next(error);
  }
});
