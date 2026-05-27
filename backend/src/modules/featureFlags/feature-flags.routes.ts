import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { FeatureFlagEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/permissionGuard';
import { ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { invalidateFeatureFlagCache } from '../../utils/featureFlags';

const featureFlagSchema = z.object({
  key: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  environment: z.string().trim().min(1).max(50).default('all'),
  description: z.string().trim().max(255).nullable().optional(),
  version: z.coerce.number().int().positive().optional(),
});

export const featureFlagsRouter = Router();
featureFlagsRouter.use('/feature-flags', requireAuth, requireRole(['ROOT_ADMIN']));

featureFlagsRouter.get('/feature-flags', async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const key = typeof req.query.key === 'string' ? req.query.key.trim().toUpperCase() : undefined;
    const environment = typeof req.query.environment === 'string' ? req.query.environment.trim() : undefined;

    const repo = AppDataSource.getRepository(FeatureFlagEntity);
    const qb = repo.createQueryBuilder('flag');
    if (key) {
      qb.andWhere('UPPER(flag.key) LIKE :key', { key: `%${key}%` });
    }
    if (environment) {
      qb.andWhere('flag.environment = :environment', { environment });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('flag.key', 'ASC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Feature flags fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

featureFlagsRouter.post('/feature-flags', async (req, res, next) => {
  try {
    const body = featureFlagSchema.parse(req.body);
    const repo = AppDataSource.getRepository(FeatureFlagEntity);
    const existing = await repo.findOneBy({ key: body.key.toUpperCase(), environment: body.environment });
    if (existing) {
      res.status(409).json({ success: false, message: 'Feature flag already exists for this environment' });
      return;
    }

    const created = repo.create({
      key: body.key.toUpperCase(),
      enabled: body.enabled,
      environment: body.environment,
      description: body.description ?? null,
    });
    await repo.save(created);
    invalidateFeatureFlagCache(created.key);
    await audit('feature_flag.create', {
      module: 'ROLE_ACCESS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'feature_flags',
      entityId: created.id,
      statusCode: 201,
      metadata: { key: created.key, environment: created.environment, enabled: created.enabled },
    });
    res.status(201).json(ok(created, 'Feature flag created'));
  } catch (error) {
    next(error);
  }
});

featureFlagsRouter.patch('/feature-flags/:id', async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = featureFlagSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(FeatureFlagEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Feature flag not found' });
      return;
    }

    if (body.version !== undefined && body.version !== entity.version) {
      res.status(409).json({ success: false, message: 'Version conflict. Please refresh and retry.' });
      return;
    }

    if (body.key !== undefined) entity.key = body.key.toUpperCase();
    if (body.enabled !== undefined) entity.enabled = body.enabled;
    if (body.environment !== undefined) entity.environment = body.environment;
    if (body.description !== undefined) entity.description = body.description ?? null;
    await repo.save(entity);
    invalidateFeatureFlagCache(entity.key);
    await audit('feature_flag.update', {
      module: 'ROLE_ACCESS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'feature_flags',
      entityId: entity.id,
      statusCode: 200,
      metadata: { key: entity.key, environment: entity.environment, enabled: entity.enabled },
    });
    res.json(ok(entity, 'Feature flag updated'));
  } catch (error) {
    next(error);
  }
});
