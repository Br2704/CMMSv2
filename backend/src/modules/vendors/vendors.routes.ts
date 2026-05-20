import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { VendorEntity, VendorNotificationSettingEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { sendMail } from '../../utils/mailer';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { applyPlantScope, applySearch } from '../../utils/query';

const vendorSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contactPerson: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  gstNumber: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

const vendorNotificationSchema = z.object({
  vendorId: z.string().uuid(),
  notifyEmail: z.boolean().default(true),
  notifyInApp: z.boolean().default(true),
  notifyBeforeDays: z.array(z.number().int().nonnegative()).default([30, 15, 7]),
  notifyOnRenewalDue: z.boolean().default(true),
  contactEmails: z.array(z.string().email()).default([]),
  plantId: z.string().uuid().nullable().optional(),
});

const vendorRenewalNotifySchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().default('AMC Renewal Notification'),
  message: z.string().min(1),
});

export const vendorsRouter = Router();
vendorsRouter.use(requireAuth);

vendorsRouter.get('/vendors', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(VendorEntity);
    const qb = repo.createQueryBuilder('vendor');
    applySearch(qb, 'vendor', query.search, ['code', 'name', 'email', 'contact_person', 'category']);
    if (!query.includeInactive) {
      qb.andWhere('vendor.is_active = :active', { active: true });
    }
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('vendor.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Vendors fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

vendorsRouter.post('/vendors', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'CREATE'), async (req, res, next) => {
  try {
    const body = vendorSchema.parse(req.body);
    const repo = AppDataSource.getRepository(VendorEntity);
    const created = repo.create(body);
    await repo.save(created);
    res.status(201).json(ok(created, 'Vendor created'));
  } catch (error) {
    next(error);
  }
});

vendorsRouter.patch('/vendors/:id', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = vendorSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(VendorEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Vendor not found' });
      return;
    }
    Object.assign(entity, body);
    await repo.save(entity);
    res.json(ok(entity, 'Vendor updated'));
  } catch (error) {
    next(error);
  }
});

vendorsRouter.delete('/vendors/:id', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(VendorEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Vendor not found' });
      return;
    }
    await repo.delete(params.id);
    await audit('vendors.delete', {
      module: 'VENDORS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'vendors',
      entityId: params.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      statusCode: 200,
    });
    res.json(ok({ id: entity.id, deleted: true }, 'Vendor deleted permanently'));
  } catch (error) {
    next(error);
  }
});

vendorsRouter.get('/vendor-notification-settings', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const repo = AppDataSource.getRepository(VendorNotificationSettingEntity);
    const qb = repo.createQueryBuilder('setting');
    applyPlantScope(qb, 'setting', 'plant_id', req.auth!, query.plantId);
    qb.skip((query.page - 1) * query.limit).take(query.limit).orderBy('setting.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    res.json(ok(data, 'Vendor notification settings fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

vendorsRouter.post('/vendor-notification-settings', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'CREATE'), async (req, res, next) => {
  try {
    const body = vendorNotificationSchema.parse(req.body);
    ensurePlantAccess(req, body.plantId ?? null);
    const repo = AppDataSource.getRepository(VendorNotificationSettingEntity);
    const created = repo.create({
      ...body,
      plantId: body.plantId ?? null,
    });
    await repo.save(created);
    res.status(201).json(ok(created, 'Vendor notification setting created'));
  } catch (error) {
    next(error);
  }
});

vendorsRouter.patch('/vendor-notification-settings/:id', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'UPDATE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = vendorNotificationSchema.partial().parse(req.body);
    const repo = AppDataSource.getRepository(VendorNotificationSettingEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Setting not found' });
      return;
    }

    const nextPlantId = body.plantId === undefined ? entity.plantId : body.plantId;
    ensurePlantAccess(req, nextPlantId ?? null);

    Object.assign(entity, body);
    await repo.save(entity);
    res.json(ok(entity, 'Vendor notification setting updated'));
  } catch (error) {
    next(error);
  }
});

vendorsRouter.delete('/vendor-notification-settings/:id', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'DELETE'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const repo = AppDataSource.getRepository(VendorNotificationSettingEntity);
    const entity = await repo.findOneBy({ id: params.id });
    if (!entity) {
      res.status(404).json({ success: false, message: 'Setting not found' });
      return;
    }
    ensurePlantAccess(req, entity.plantId);
    await repo.delete({ id: params.id });
    res.json(ok({ id: params.id, deleted: true }, 'Vendor notification setting deleted'));
  } catch (error) {
    next(error);
  }
});

vendorsRouter.post('/vendors/notify-renewals', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('VENDORS', 'UPDATE'), async (req, res, next) => {
  try {
    const body = vendorRenewalNotifySchema.parse(req.body);
    const result = await sendMail(body.to, body.subject, body.message);
    res.json(ok(result, result.sent ? 'Vendor renewal notification sent' : 'Vendor renewal notification could not be sent'));
  } catch (error) {
    next(error);
  }
});
