import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { SafetyIncidentEntity, SafetyMetricEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { applyPlantScope, applySearch } from '../../utils/query';

const safetyIncidentSchema = z.object({
  incidentNumber: z.string().optional(),
  incidentType: z.string().default('GENERAL'),
  severity: z.string().default('LOW'),
  location: z.string().nullable().optional(),
  description: z.string().min(1),
  immediateAction: z.string().nullable().optional(),
  peopleInvolved: z.coerce.number().int().nonnegative().default(0),
  reportedBy: z.string().uuid().nullable().optional(),
  workOrderId: z.string().uuid().nullable().optional(),
  plantId: z.string().uuid().nullable().optional(),
  status: z.string().default('OPEN'),
  incidentDate: z.string().optional(),
  closureDate: z.string().nullable().optional(),
  lostTimeHours: z.number().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

const safetyMetricSchema = z.object({
  metricName: z.string().min(1),
  category: z.string().default('General'),
  unit: z.string().nullable().optional(),
  targetValue: z.union([z.string(), z.number()]).nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  fieldId: z.string().uuid().nullable().optional(),
  aggregationMethod: z.string().default('SUM'),
  plantId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const safetyRouter = Router();
safetyRouter.use(requireAuth);

safetyRouter.get('/safety/incidents', requirePermission('SAFETY', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(SafetyIncidentEntity);
    const qb = repo.createQueryBuilder('incident');
    applySearch(qb, 'incident', query.search, ['incident_number', 'incident_type', 'severity', 'status', 'location']);
    applyPlantScope(qb, 'incident', 'plant_id', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('incident.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Safety incidents fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

safetyRouter.get('/safety', requirePermission('SAFETY', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(SafetyIncidentEntity);
    const qb = repo.createQueryBuilder('incident');
    applySearch(qb, 'incident', query.search, ['incident_number', 'incident_type', 'severity', 'status', 'location']);
    applyPlantScope(qb, 'incident', 'plant_id', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('incident.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Safety incidents fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

safetyRouter.get('/safety/:id', requirePermission('SAFETY', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(SafetyIncidentEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Safety incident not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    res.json(ok(entity, 'Safety incident fetched'));
  } catch (error) {
    next(error);
  }
});

safetyRouter.post('/safety/incidents', requirePermission('SAFETY', 'CREATE'), async (req, res, next) => {
  try {
    const body = safetyIncidentSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);
    const repo = AppDataSource.getRepository(SafetyIncidentEntity);
    const created = repo.create({
      ...body,
      incidentNumber: body.incidentNumber ?? `INC-${Date.now()}`,
      reportedBy: body.reportedBy ?? req.auth!.userId,
      plantId: resolvedPlantId,
      incidentDate: body.incidentDate ? new Date(body.incidentDate) : new Date(),
      closureDate: body.closureDate ? new Date(body.closureDate) : null,
      immediateAction: body.immediateAction ?? null,
      peopleInvolved: body.peopleInvolved,
      lostTimeHours: String(body.lostTimeHours),
      location: body.location ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Safety incident created'));
  } catch (error) {
    next(error);
  }
});

safetyRouter.patch('/safety/incidents/:id', requirePermission('SAFETY', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = safetyIncidentSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(SafetyIncidentEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Safety incident not found' });
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, nextPlantId);
    Object.assign(entity, body);
    if (body.incidentDate !== undefined) entity.incidentDate = body.incidentDate ? new Date(body.incidentDate) : entity.incidentDate;
    if (body.closureDate !== undefined) entity.closureDate = body.closureDate ? new Date(body.closureDate) : null;
    if (body.lostTimeHours !== undefined) entity.lostTimeHours = String(body.lostTimeHours);
    await repo.save(entity);
    res.json(ok(entity, 'Safety incident updated'));
  } catch (error) {
    next(error);
  }
});

safetyRouter.get('/safety/metrics', requirePermission('SAFETY', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(SafetyMetricEntity);
    const qb = repo.createQueryBuilder('metric');
    applySearch(qb, 'metric', query.search, ['metric_name', 'category', 'aggregation_method']);
    applyPlantScope(qb, 'metric', 'plant_id', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('metric.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Safety metrics fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

safetyRouter.post('/safety/metrics', requirePermission('SAFETY', 'CREATE'), async (req, res, next) => {
  try {
    const body = safetyMetricSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);
    const repo = AppDataSource.getRepository(SafetyMetricEntity);
    const created = repo.create({
      ...body,
      plantId: resolvedPlantId,
      targetValue: body.targetValue === undefined || body.targetValue === null ? null : String(body.targetValue),
      unit: body.unit ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Safety metric created'));
  } catch (error) {
    next(error);
  }
});

safetyRouter.patch('/safety/metrics/:id', requirePermission('SAFETY', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = safetyMetricSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(SafetyMetricEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Safety metric not found' });
      return;
    }
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? entity.plantId : body.plantId);
    ensurePlantAccess(req, nextPlantId);
    Object.assign(entity, body);
    if (body.targetValue !== undefined) entity.targetValue = body.targetValue === null ? null : String(body.targetValue);
    await repo.save(entity);
    res.json(ok(entity, 'Safety metric updated'));
  } catch (error) {
    next(error);
  }
});
