import { randomUUID } from 'crypto';
import { Router, type Request } from 'express';
import { EntityManager, IsNull } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import {
  DepartmentEntity,
  GateEntity,
  GateEntryEntity,
  GeoFenceEntity,
  MachineModuleEntity,
  NotificationEntity,
  PathwayEntity,
  PlantCoordinateEntity,
  PlantEntity,
  PlantLayoutEntity,
  ProfileEntity,
  RoleEntity,
  UserEntity,
  UserRoleEntity,
  VisitorNavigationLogEntity,
  VisitorSessionEntity,
  VisitorTrackingEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { hashPassword } from '../../utils/password';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { ensureRoleCatalogEntry } from '../../utils/roleCatalog';
import { publishNotificationChange } from '../notifications/notification-stream';
import { publishVisitorTrackingChange, subscribeVisitorTrackingStream } from './visitor-tracking-stream';

type GeoPoint = {
  latitude: number;
  longitude: number;
};

const optionalUuid = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null;
  return value;
}, z.string().uuid().nullable());

const optionalString = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

const optionalDate = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const candidate = new Date(value);
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }
  return value;
}, z.date().nullable());

const pointSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

const adminLayoutSchema = z.object({
  plantId: z.string().uuid(),
  layoutName: z.string().min(1).max(120).default('Plant Layout'),
  svgMarkup: optionalString,
  imageDataUrl: optionalString,
  boundaryPoints: z.array(pointSchema).optional().nullable(),
  departmentMappings: z
    .array(
      z.object({
        departmentId: z.string().uuid(),
        coordinateId: optionalUuid,
        productNames: z.array(z.string().min(1)).optional().nullable(),
        employeeUserIds: z.array(z.string().uuid()).optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  mapData: z.record(z.unknown()).optional().nullable(),
});

const coordinateSchema = z.object({
  id: optionalUuid,
  plantId: z.string().uuid(),
  gateId: optionalUuid,
  departmentId: optionalUuid,
  moduleId: optionalUuid,
  locationName: z.string().min(1).max(160),
  locationType: z.enum(['GATE', 'DEPARTMENT', 'MODULE', 'KEY_LOCATION', 'BUILDING']).default('KEY_LOCATION'),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  boundaryPoints: z.array(pointSchema).optional().nullable(),
  meta: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
});

const pathwaySchema = z.object({
  id: optionalUuid,
  plantId: z.string().uuid(),
  pathwayName: z.string().min(1).max(160),
  pathType: z.enum(['WALKABLE', 'RESTRICTED', 'SERVICE', 'EMERGENCY']).default('WALKABLE'),
  startCoordinateId: optionalUuid,
  endCoordinateId: optionalUuid,
  cornerPoints: z.array(pointSchema).optional().nullable(),
  routeMeta: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
});

const geoFenceSchema = z.object({
  id: optionalUuid,
  plantId: z.string().uuid(),
  fenceName: z.string().min(1).max(160),
  fenceType: z.enum(['ALLOWED', 'RESTRICTED']).default('ALLOWED'),
  polygonPoints: z.array(pointSchema).min(3),
  alertOnViolation: z.boolean().optional(),
  activeFrom: optionalDate,
  activeTo: optionalDate,
  isActive: z.boolean().optional(),
});

const visitorCreateSchema = z.object({
  gateId: optionalUuid,
  plantId: z.string().uuid(),
  departmentId: optionalUuid,
  moduleId: optionalUuid,
  personToMeetUserId: z.string().uuid(),
  visitorName: z.string().min(1).max(120),
  visitorCompany: optionalString,
  visitorPhone: optionalString,
  purpose: z.string().min(1).max(500),
  durationHours: z.coerce.number().int().min(1).max(24).default(2),
  visitStartTime: optionalDate,
  visitEndTime: optionalDate,
  desiredVisitAt: optionalDate,
  idProofType: optionalString,
  idProofNumber: optionalString,
  vehicleNumber: optionalString,
  remarks: optionalString,
});

const visitorApprovalSchema = z.object({
  gateEntryId: optionalUuid,
  sessionId: optionalUuid,
  action: z.enum(['APPROVE', 'REJECT']),
  comments: optionalString,
  meetingLocationNodeId: optionalString,
  meetingLocationLabel: optionalString,
  meetingDepartmentId: optionalUuid,
  escortUserId: optionalUuid,
});

const sessionLookupSchema = z.object({
  sessionToken: optionalString,
  sessionId: optionalUuid,
  gateEntryId: optionalUuid,
});

const locationUpdateSchema = z.object({
  sessionToken: optionalString,
  sessionId: optionalUuid,
  gateEntryId: optionalUuid,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  nodeId: optionalString,
  nodeLabel: optionalString,
  source: z.enum(['GPS', 'MANUAL', 'CHECKPOINT']).default('GPS'),
});

const routeQuerySchema = z.object({
  sessionToken: optionalString,
  sessionId: optionalUuid,
  gateEntryId: optionalUuid,
  fromCoordinateId: optionalUuid,
  toCoordinateId: optionalUuid,
});

function normalizePhone(value: string | null | undefined) {
  const raw = String(value ?? '').replace(/[^0-9]/g, '');
  return raw.length > 0 ? raw : null;
}

function normalizeLookupKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function clampDurationHours(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 2;
  return Math.min(24, Math.max(1, Math.round(value)));
}

function extractDurationHoursFromEntryData(entryData: Array<Record<string, unknown>> | null | undefined) {
  if (!Array.isArray(entryData)) return null;

  for (const row of entryData) {
    const fieldName = normalizeLookupKey(row.fieldName);
    const fieldLabel = normalizeLookupKey(row.fieldLabel);
    const isDurationField =
      fieldName === 'visit_duration_hours'
      || fieldName === 'duration_hours'
      || fieldName === 'allowed_duration_hours'
      || fieldLabel === 'visit_duration_hours'
      || fieldLabel === 'duration_hours';

    if (!isDurationField) continue;

    const parsed = typeof row.value === 'number' ? row.value : Number(row.value ?? NaN);
    if (Number.isFinite(parsed) && parsed > 0) {
      return clampDurationHours(parsed);
    }
  }

  return null;
}

function toPointArray(value: unknown): GeoPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const input = row as Record<string, unknown>;
      const latitude = typeof input.latitude === 'number' ? input.latitude : Number(input.latitude ?? NaN);
      const longitude = typeof input.longitude === 'number' ? input.longitude : Number(input.longitude ?? NaN);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { latitude, longitude };
    })
    .filter((row): row is GeoPoint => Boolean(row));
}

function pointInPolygon(point: GeoPoint, polygon: GeoPoint[]) {
  if (polygon.length < 3) return false;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersects = (yi > point.latitude) !== (yj > point.latitude)
      && point.longitude < ((xj - xi) * (point.latitude - yi)) / ((yj - yi) || 1e-9) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function haversineMeters(a: GeoPoint, b: GeoPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371_000;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadius * c;
}

function isPrivilegedApprover(roles: string[]) {
  const normalized = roles.map((role) => role.toUpperCase());
  return normalized.some((role) => ['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN', 'SECURITY', 'SECURITY_USER'].includes(role));
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

async function resolvePlant(req: Request, requestedPlantId: string | null) {
  const resolvedPlantId = resolveScopedPlantId(req.auth!, requestedPlantId ?? null);
  if (!resolvedPlantId) {
    return null;
  }
  ensurePlantAccess(req, resolvedPlantId);
  return resolvedPlantId;
}

async function createTemporaryVisitorIdentity(input: {
  manager: EntityManager;
  plantId: string;
  visitorName: string;
  visitorPhone: string | null;
}) {
  const roleRepo = input.manager.getRepository(RoleEntity);
  const userRepo = input.manager.getRepository(UserEntity);
  const profileRepo = input.manager.getRepository(ProfileEntity);
  const userRoleRepo = input.manager.getRepository(UserRoleEntity);
  const plantRepo = input.manager.getRepository(PlantEntity);

  const visitorRole = await ensureRoleCatalogEntry(roleRepo, 'TEMPORARY_VISITOR', {
    description: 'Temporary visitor access role created from smart gate workflow',
    isSystem: true,
  });

  const plant = await plantRepo.findOneBy({ id: input.plantId });
  const phoneDigits = normalizePhone(input.visitorPhone);
  const timestamp = Date.now();
  const shortToken = randomUUID().replace(/-/g, '').slice(0, 10);
  const email = `visitor.${phoneDigits ?? 'guest'}.${timestamp}@jkfenner.visitor.local`;
  const tempPassword = `Visit#${shortToken}`;

  const existingEmail = await userRepo.findOneBy({ email });
  if (existingEmail) {
    throw new Error('Unable to generate unique visitor login email. Retry request.');
  }

  const userCode = `VIS-${String(timestamp).slice(-6)}-${shortToken.slice(0, 4).toUpperCase()}`;

  const createdUser = userRepo.create({
    email,
    passwordHash: await hashPassword(tempPassword),
    fullName: input.visitorName,
    phone: phoneDigits,
    isActive: false,
    organizationId: plant?.organizationId ?? null,
    orgRoleId: null,
  });
  await userRepo.save(createdUser);

  const createdProfile = profileRepo.create({
    userId: createdUser.id,
    userCode,
    fullName: createdUser.fullName,
    email: createdUser.email,
    phone: createdUser.phone,
    profileImageUrl: null,
    plantId: input.plantId,
    department: null,
    isActive: false,
  });
  await profileRepo.save(createdProfile);

  const userRole = userRoleRepo.create({
    userId: createdUser.id,
    roleId: visitorRole.id,
    role: 'TEMPORARY_VISITOR',
    plantId: input.plantId,
  });
  await userRoleRepo.save(userRole);

  return {
    user: createdUser,
    profile: createdProfile,
    tempPassword,
    loginEmail: createdUser.email,
  };
}

async function refreshSessionState(input: {
  manager: EntityManager;
  session: VisitorSessionEntity;
}) {
  const now = new Date();
  const sessionRepo = input.manager.getRepository(VisitorSessionEntity);
  const gateEntryRepo = input.manager.getRepository(GateEntryEntity);
  const userRepo = input.manager.getRepository(UserEntity);
  const profileRepo = input.manager.getRepository(ProfileEntity);

  const session = input.session;
  const gateEntry = await gateEntryRepo.findOneBy({ id: session.gateEntryId });
  const visitorUser = session.visitorUserId ? await userRepo.findOneBy({ id: session.visitorUserId }) : null;
  const visitorProfile = session.visitorUserId ? await profileRepo.findOneBy({ userId: session.visitorUserId }) : null;

  let changed = false;

  const withinWindow = now >= session.startTime && now <= session.endTime;
  const expired = now > session.endTime;

  if (session.approvalStatus === 'REJECTED') {
    if (session.status !== 'REJECTED') {
      session.status = 'REJECTED';
      changed = true;
    }
    if (session.isActive) {
      session.isActive = false;
      changed = true;
    }
    if (gateEntry) {
      gateEntry.status = 'REJECTED';
      gateEntry.navigationEnabled = false;
      await gateEntryRepo.save(gateEntry);
    }
    if (visitorUser && visitorUser.isActive) {
      visitorUser.isActive = false;
      await userRepo.save(visitorUser);
    }
    if (visitorProfile && visitorProfile.isActive) {
      visitorProfile.isActive = false;
      await profileRepo.save(visitorProfile);
    }
  } else if (session.approvalStatus !== 'APPROVED') {
    if (session.status !== 'PENDING') {
      session.status = 'PENDING';
      changed = true;
    }
    if (session.isActive) {
      session.isActive = false;
      changed = true;
    }
    if (visitorUser && visitorUser.isActive) {
      visitorUser.isActive = false;
      await userRepo.save(visitorUser);
    }
    if (visitorProfile && visitorProfile.isActive) {
      visitorProfile.isActive = false;
      await profileRepo.save(visitorProfile);
    }
  } else if (expired) {
    if (session.status !== 'EXPIRED') {
      session.status = 'EXPIRED';
      changed = true;
    }
    if (session.isActive) {
      session.isActive = false;
      changed = true;
    }

    if (gateEntry) {
      gateEntry.status = 'EXPIRED';
      gateEntry.navigationEnabled = false;
      await gateEntryRepo.save(gateEntry);
    }

    if (visitorUser && visitorUser.isActive) {
      visitorUser.isActive = false;
      await userRepo.save(visitorUser);
    }
    if (visitorProfile && visitorProfile.isActive) {
      visitorProfile.isActive = false;
      await profileRepo.save(visitorProfile);
    }
  } else {
    const nextStatus = withinWindow ? 'ACTIVE' : 'APPROVED';
    const nextActive = withinWindow;

    if (session.status !== nextStatus) {
      session.status = nextStatus;
      changed = true;
    }

    if (session.isActive !== nextActive) {
      session.isActive = nextActive;
      changed = true;
    }

    if (gateEntry) {
      gateEntry.navigationEnabled = true;
      gateEntry.status = withinWindow ? 'IN' : 'APPROVED';
      await gateEntryRepo.save(gateEntry);
    }

    if (visitorUser && visitorUser.isActive !== nextActive) {
      visitorUser.isActive = nextActive;
      await userRepo.save(visitorUser);
    }
    if (visitorProfile && visitorProfile.isActive !== nextActive) {
      visitorProfile.isActive = nextActive;
      await profileRepo.save(visitorProfile);
    }
  }

  if (changed) {
    await sessionRepo.save(session);
  }

  return session;
}

async function findSessionByLookup(input: {
  manager: EntityManager;
  auth: NonNullable<Request['auth']>;
  lookup: z.infer<typeof sessionLookupSchema>;
}) {
  const sessionRepo = input.manager.getRepository(VisitorSessionEntity);

  if (input.lookup.sessionId) {
    return sessionRepo.findOneBy({ id: input.lookup.sessionId });
  }
  if (input.lookup.sessionToken) {
    return sessionRepo.findOneBy({ sessionToken: input.lookup.sessionToken });
  }
  if (input.lookup.gateEntryId) {
    return sessionRepo.findOneBy({ gateEntryId: input.lookup.gateEntryId });
  }

  const isVisitor = (input.auth.roles ?? []).some((role) => {
    const normalized = role.toUpperCase();
    return normalized === 'VISITOR' || normalized === 'TEMPORARY_VISITOR';
  });
  if (isVisitor) {
    return sessionRepo.findOne({
      where: { visitorUserId: input.auth.userId },
      order: { createdAt: 'DESC' },
    });
  }

  return null;
}

function pathDistanceFromPoints(points: GeoPoint[]) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineMeters(points[index - 1], points[index]);
  }
  return total;
}

function buildRouteGraph(input: {
  coordinates: PlantCoordinateEntity[];
  pathways: PathwayEntity[];
}) {
  const coordinateMap = new Map(input.coordinates.map((coordinate) => [coordinate.id, coordinate]));

  const adjacency = new Map<string, Array<{ to: string; pathwayId: string; weight: number }>>();
  input.coordinates.forEach((coordinate) => adjacency.set(coordinate.id, []));

  input.pathways
    .filter((pathway) => pathway.isActive && pathway.pathType !== 'RESTRICTED')
    .forEach((pathway) => {
      if (!pathway.startCoordinateId || !pathway.endCoordinateId) return;

      const from = coordinateMap.get(pathway.startCoordinateId);
      const to = coordinateMap.get(pathway.endCoordinateId);
      if (!from || !to) return;

      const routeMetaDistance = Number((pathway.routeMeta as { distanceMeters?: unknown } | null)?.distanceMeters ?? NaN);
      const points = toPointArray(pathway.cornerPoints ?? null);
      const fallbackDistance = haversineMeters(
        { latitude: Number(from.latitude), longitude: Number(from.longitude) },
        { latitude: Number(to.latitude), longitude: Number(to.longitude) },
      );
      const pathDistance = Number.isFinite(routeMetaDistance) && routeMetaDistance > 0
        ? routeMetaDistance
        : points.length >= 2
          ? pathDistanceFromPoints(points)
          : fallbackDistance;

      adjacency.get(from.id)?.push({ to: to.id, pathwayId: pathway.id, weight: Math.max(1, pathDistance) });
      adjacency.get(to.id)?.push({ to: from.id, pathwayId: pathway.id, weight: Math.max(1, pathDistance) });
    });

  return { coordinateMap, adjacency };
}

function shortestPathFromGraph(input: {
  sourceId: string;
  destinationId: string;
  adjacency: Map<string, Array<{ to: string; pathwayId: string; weight: number }>>;
}) {
  const distances = new Map<string, number>();
  const previous = new Map<string, { nodeId: string | null; pathwayId: string | null }>();
  const unvisited = new Set<string>(input.adjacency.keys());

  input.adjacency.forEach((_value, nodeId) => {
    distances.set(nodeId, Number.POSITIVE_INFINITY);
    previous.set(nodeId, { nodeId: null, pathwayId: null });
  });
  distances.set(input.sourceId, 0);

  while (unvisited.size > 0) {
    let currentNodeId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    unvisited.forEach((nodeId) => {
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        currentDistance = distance;
        currentNodeId = nodeId;
      }
    });

    if (!currentNodeId || currentDistance === Number.POSITIVE_INFINITY) break;
    if (currentNodeId === input.destinationId) break;

    unvisited.delete(currentNodeId);

    const neighbors = input.adjacency.get(currentNodeId) ?? [];
    neighbors.forEach((neighbor) => {
      if (!unvisited.has(neighbor.to)) return;
      const candidateDistance = (distances.get(currentNodeId ?? '') ?? Number.POSITIVE_INFINITY) + neighbor.weight;
      if (candidateDistance < (distances.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.to, candidateDistance);
        previous.set(neighbor.to, { nodeId: currentNodeId, pathwayId: neighbor.pathwayId });
      }
    });
  }

  const nodeIds: string[] = [];
  const pathwayIds: string[] = [];

  let cursor: string | null = input.destinationId;
  while (cursor) {
    nodeIds.unshift(cursor);
    const prev = previous.get(cursor);
    if (prev?.pathwayId) {
      pathwayIds.unshift(prev.pathwayId);
    }
    cursor = prev?.nodeId ?? null;
  }

  if (nodeIds[0] !== input.sourceId) {
    return { nodeIds: [input.sourceId, input.destinationId], pathwayIds: [] };
  }

  return { nodeIds, pathwayIds };
}

function activeFence(input: { fence: GeoFenceEntity; now: Date }) {
  if (!input.fence.isActive) return false;
  if (input.fence.activeFrom && input.fence.activeFrom > input.now) return false;
  if (input.fence.activeTo && input.fence.activeTo < input.now) return false;
  return true;
}

async function evaluateGeoFence(input: {
  plantId: string | null;
  latitude: number;
  longitude: number;
  manager: EntityManager;
}) {
  if (!input.plantId) {
    return { status: 'WITHIN', violatedFence: null as GeoFenceEntity | null };
  }

  const geoFenceRepo = input.manager.getRepository(GeoFenceEntity);
  const fences = await geoFenceRepo.find({ where: { plantId: input.plantId, isActive: true } });
  const now = new Date();
  const point = { latitude: input.latitude, longitude: input.longitude };

  const activeFences = fences.filter((fence) => activeFence({ fence, now }));
  const restricted = activeFences.filter((fence) => fence.fenceType.toUpperCase() === 'RESTRICTED');
  const allowed = activeFences.filter((fence) => fence.fenceType.toUpperCase() === 'ALLOWED');

  const restrictedMatch = restricted.find((fence) => pointInPolygon(point, toPointArray(fence.polygonPoints)));
  if (restrictedMatch) {
    return { status: 'IN_RESTRICTED', violatedFence: restrictedMatch };
  }

  if (allowed.length > 0) {
    const insideAllowed = allowed.some((fence) => pointInPolygon(point, toPointArray(fence.polygonPoints)));
    if (!insideAllowed) {
      return { status: 'OUTSIDE_ALLOWED', violatedFence: null };
    }
  }

  return { status: 'WITHIN', violatedFence: null as GeoFenceEntity | null };
}

async function notifySecurityAndAdmins(input: {
  manager: EntityManager;
  plantId: string | null;
  title: string;
  message: string;
  link?: string;
}) {
  if (!input.plantId) return;

  const roleRepo = input.manager.getRepository(UserRoleEntity);
  const notificationRepo = input.manager.getRepository(NotificationEntity);

  const roleRows = await roleRepo.find({
    where: [
      { role: 'SECURITY', plantId: input.plantId },
      { role: 'SECURITY_USER', plantId: input.plantId },
      { role: 'ADMIN', plantId: input.plantId },
      { role: 'SUPERADMIN', plantId: IsNull() },
    ],
  });

  const userIds = Array.from(new Set(roleRows.map((row) => row.userId).filter(Boolean)));
  if (userIds.length === 0) return;

  const notifications = userIds.map((userId) =>
    notificationRepo.create({
      userId,
      title: input.title,
      message: input.message,
      type: 'critical',
      isRead: false,
      link: input.link ?? '/visitor-experience',
      woId: null,
    }),
  );

  await notificationRepo.save(notifications);
  userIds.forEach((userId) => publishNotificationChange(userId));
}

export const smartVisitorRouter = Router();
smartVisitorRouter.use(requireAuth);

smartVisitorRouter.get('/admin/plant-layout', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const plantId = await resolvePlant(req, requestedPlantId);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const [layout, coordinates, pathways, geoFences, departments, modules, employees] = await Promise.all([
      AppDataSource.getRepository(PlantLayoutEntity).findOne({ where: { plantId, isActive: true }, order: { updatedAt: 'DESC' } }),
      AppDataSource.getRepository(PlantCoordinateEntity).find({ where: { plantId, isActive: true }, order: { locationName: 'ASC' } }),
      AppDataSource.getRepository(PathwayEntity).find({ where: { plantId, isActive: true }, order: { pathwayName: 'ASC' } }),
      AppDataSource.getRepository(GeoFenceEntity).find({ where: { plantId, isActive: true }, order: { fenceName: 'ASC' } }),
      AppDataSource.getRepository(DepartmentEntity).find({ where: { plantId, isActive: true }, order: { name: 'ASC' } }),
      AppDataSource.getRepository(MachineModuleEntity).find({ where: { plantId, isActive: true }, order: { name: 'ASC' } }),
      AppDataSource.getRepository(ProfileEntity).find({ where: { plantId, isActive: true }, order: { fullName: 'ASC' } }),
    ]);

    res.json(
      ok(
        {
          layout,
          coordinates,
          pathways,
          geoFences,
          hierarchy: {
            departments,
            modules,
            employees: employees.map((profile) => ({
              userId: profile.userId,
              fullName: profile.fullName,
              userCode: profile.userCode,
            })),
          },
        },
        'Plant mapping configuration fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.post('/admin/plant-layout', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const body = adminLayoutSchema.parse(req.body);
    const plantId = await resolvePlant(req, body.plantId);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const repo = AppDataSource.getRepository(PlantLayoutEntity);
    let entity = await repo.findOne({ where: { plantId, isActive: true }, order: { updatedAt: 'DESC' } });

    if (!entity) {
      entity = repo.create({
        plantId,
        createdBy: req.auth!.userId,
      });
    }

    const existingMapData = entity.mapData && typeof entity.mapData === 'object'
      ? (entity.mapData as Record<string, unknown>)
      : {};

    entity.layoutName = body.layoutName;
    entity.svgMarkup = body.svgMarkup ?? entity.svgMarkup;
    entity.version = (entity.version ?? 0) + 1;
    entity.isActive = true;
    entity.publishedAt = new Date();
    entity.createdBy = req.auth!.userId;
    entity.mapData = {
      ...existingMapData,
      ...(body.mapData ?? {}),
      boundaryPoints: body.boundaryPoints ?? (existingMapData.boundaryPoints ?? []),
      departmentMappings: body.departmentMappings ?? (existingMapData.departmentMappings ?? []),
      layoutImageDataUrl: body.imageDataUrl ?? (existingMapData.layoutImageDataUrl ?? null),
    };

    const saved = await repo.save(entity);
    res.json(ok(saved, 'Plant layout mapping saved'));
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.get('/admin/plant-coordinates', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const plantId = await resolvePlant(req, requestedPlantId);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const rows = await AppDataSource.getRepository(PlantCoordinateEntity).find({
      where: { plantId, isActive: true },
      order: { locationName: 'ASC' },
    });

    res.json(ok(rows, 'Plant coordinates fetched'));
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.post('/admin/plant-coordinates', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const body = coordinateSchema.parse(req.body);
    const plantId = await resolvePlant(req, body.plantId);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const repo = AppDataSource.getRepository(PlantCoordinateEntity);
    let entity = body.id ? await repo.findOneBy({ id: body.id }) : null;

    if (entity && entity.plantId !== plantId) {
      res.status(403).json(fail('Coordinate does not belong to selected plant'));
      return;
    }

    if (!entity) {
      entity = repo.create({
        plantId,
        createdBy: req.auth!.userId,
      });
    }

    entity.gateId = body.gateId;
    entity.departmentId = body.departmentId;
    entity.moduleId = body.moduleId;
    entity.locationName = body.locationName;
    entity.locationType = body.locationType;
    entity.latitude = body.latitude.toFixed(7);
    entity.longitude = body.longitude.toFixed(7);
    entity.boundaryPoints = body.boundaryPoints ?? null;
    entity.meta = body.meta ?? null;
    entity.isActive = body.isActive ?? true;
    entity.createdBy = req.auth!.userId;

    const saved = await repo.save(entity);
    res.json(ok(saved, body.id ? 'Coordinate updated' : 'Coordinate created'));
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.get('/admin/pathways', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const plantId = await resolvePlant(req, requestedPlantId);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const rows = await AppDataSource.getRepository(PathwayEntity).find({
      where: { plantId, isActive: true },
      order: { pathwayName: 'ASC' },
    });

    res.json(ok(rows, 'Pathways fetched'));
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.post('/admin/pathways', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const body = pathwaySchema.parse(req.body);
    const plantId = await resolvePlant(req, body.plantId);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const coordinateRepo = AppDataSource.getRepository(PlantCoordinateEntity);

    const coordinateIds = [body.startCoordinateId, body.endCoordinateId].filter((value): value is string => Boolean(value));
    if (coordinateIds.length > 0) {
      const coordinates = await coordinateRepo.find({ where: coordinateIds.map((id) => ({ id, plantId })) });
      if (coordinates.length !== coordinateIds.length) {
        res.status(400).json(fail('Pathway coordinates must belong to selected plant'));
        return;
      }
    }

    const repo = AppDataSource.getRepository(PathwayEntity);
    let entity = body.id ? await repo.findOneBy({ id: body.id }) : null;

    if (entity && entity.plantId !== plantId) {
      res.status(403).json(fail('Pathway does not belong to selected plant'));
      return;
    }

    if (!entity) {
      entity = repo.create({
        plantId,
        createdBy: req.auth!.userId,
      });
    }

    entity.pathwayName = body.pathwayName;
    entity.pathType = body.pathType;
    entity.startCoordinateId = body.startCoordinateId;
    entity.endCoordinateId = body.endCoordinateId;
    entity.cornerPoints = body.cornerPoints ?? null;
    entity.routeMeta = body.routeMeta ?? null;
    entity.isActive = body.isActive ?? true;
    entity.createdBy = req.auth!.userId;

    const saved = await repo.save(entity);
    res.json(ok(saved, body.id ? 'Pathway updated' : 'Pathway created'));
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.get('/admin/geo-fences', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const plantId = await resolvePlant(req, requestedPlantId);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const rows = await AppDataSource.getRepository(GeoFenceEntity).find({
      where: { plantId, isActive: true },
      order: { fenceName: 'ASC' },
    });

    res.json(ok(rows, 'Geo-fences fetched'));
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.post('/admin/geo-fences', requireRole(['SUPERADMIN', 'ADMIN']), requirePermission('GATES', 'UPDATE'), async (req, res, next) => {
  try {
    const body = geoFenceSchema.parse(req.body);
    const plantId = await resolvePlant(req, body.plantId);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const repo = AppDataSource.getRepository(GeoFenceEntity);
    let entity = body.id ? await repo.findOneBy({ id: body.id }) : null;

    if (entity && entity.plantId !== plantId) {
      res.status(403).json(fail('Geo-fence does not belong to selected plant'));
      return;
    }

    if (!entity) {
      entity = repo.create({
        plantId,
        createdBy: req.auth!.userId,
      });
    }

    entity.fenceName = body.fenceName;
    entity.fenceType = body.fenceType;
    entity.polygonPoints = body.polygonPoints;
    entity.alertOnViolation = body.alertOnViolation ?? true;
    entity.activeFrom = body.activeFrom;
    entity.activeTo = body.activeTo;
    entity.isActive = body.isActive ?? true;
    entity.createdBy = req.auth!.userId;

    const saved = await repo.save(entity);
    res.json(ok(saved, body.id ? 'Geo-fence updated' : 'Geo-fence created'));
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.post('/visitor/create', requireRole(['SECURITY', 'SECURITY_USER']), requirePermission('GATES', 'CREATE'), async (req, res, next) => {
  try {
    const body = visitorCreateSchema.parse(req.body);
    const plantId = await resolvePlant(req, body.plantId);

    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    const gateRepo = AppDataSource.getRepository(GateEntity);
    const userRepo = AppDataSource.getRepository(UserEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);

    const [gate, personToMeet, personProfile] = await Promise.all([
      body.gateId
        ? gateRepo.findOneBy({ id: body.gateId, isActive: true })
        : gateRepo.findOne({ where: { plantId, isActive: true }, order: { createdAt: 'ASC' } }),
      userRepo.findOneBy({ id: body.personToMeetUserId }),
      profileRepo.findOneBy({ userId: body.personToMeetUserId }),
    ]);

    if (!personToMeet) {
      res.status(404).json(fail('Requested employee not found'));
      return;
    }

    if (personProfile?.plantId && personProfile.plantId !== plantId) {
      res.status(400).json(fail('Selected employee is not mapped to selected plant'));
      return;
    }

    if (!gate || (gate.plantId && gate.plantId !== plantId)) {
      res.status(400).json(fail('No active gate mapped to selected plant'));
      return;
    }

    const now = new Date();
    const requestedStart = body.visitStartTime ?? body.desiredVisitAt ?? now;
    const requestedDurationHours = clampDurationHours(body.durationHours);
    const requestedEnd = body.visitEndTime ?? new Date(requestedStart.getTime() + requestedDurationHours * 60 * 60 * 1000);

    if (requestedEnd <= requestedStart) {
      res.status(400).json(fail('Visit end time must be after visit start time'));
      return;
    }

    const durationHours = clampDurationHours(Math.ceil((requestedEnd.getTime() - requestedStart.getTime()) / (60 * 60 * 1000)));

    const result = await AppDataSource.transaction(async (manager) => {
      const identity = await createTemporaryVisitorIdentity({
        manager,
        plantId,
        visitorName: body.visitorName,
        visitorPhone: body.visitorPhone,
      });

      const entryRepo = manager.getRepository(GateEntryEntity);
      const sessionRepo = manager.getRepository(VisitorSessionEntity);
      const notificationRepo = manager.getRepository(NotificationEntity);

      const entry = entryRepo.create({
        gateId: gate.id,
        plantId,
        departmentId: body.departmentId,
        moduleId: body.moduleId,
        machineId: null,
        templateId: null,
        visitorName: body.visitorName,
        visitorCompany: body.visitorCompany,
        visitorPhone: normalizePhone(body.visitorPhone),
        visitorType: 'VISITOR_SESSION',
        purpose: body.purpose,
        personToMeet: personToMeet.fullName ?? personToMeet.email,
        personToMeetUserId: personToMeet.id,
        visitorUserId: identity.user.id,
        vehicleNumber: body.vehicleNumber,
        idProofType: body.idProofType,
        idProofNumber: body.idProofNumber,
        itemsCarried: null,
        vendorName: null,
        materialDescription: null,
        quantity: null,
        gatePassNumber: null,
        invoiceNumber: null,
        entryData: [
          {
            fieldName: 'allowed_visit_start_at',
            fieldLabel: 'Allowed Visit Start',
            fieldType: 'DATETIME',
            value: requestedStart.toISOString(),
          },
          {
            fieldName: 'allowed_visit_end_at',
            fieldLabel: 'Allowed Visit End',
            fieldType: 'DATETIME',
            value: requestedEnd.toISOString(),
          },
          {
            fieldName: 'visit_duration_hours',
            fieldLabel: 'Visit Duration Hours',
            fieldType: 'NUMBER',
            value: durationHours,
          },
        ],
        qrCodeValue: null,
        duplicateDetected: false,
        blacklistAlert: false,
        watchlistAlert: false,
        entryTime: now,
        exitTime: null,
        badgeNumber: null,
        remarks: body.remarks,
        recordedBy: req.auth!.userId,
        exitApprovedBy: null,
        exitRemarks: null,
        status: 'PENDING',
        approvalStatus: 'PENDING',
        approvalRequestedAt: now,
        approvalRespondedAt: null,
        approvalBy: null,
        approvalComments: null,
        navigationEnabled: false,
        navigationEnabledAt: null,
        desiredVisitAt: body.desiredVisitAt ?? requestedStart,
        allowedVisitStartAt: requestedStart,
        allowedVisitEndAt: requestedEnd,
        currentLocationNodeId: null,
        currentLocationLabel: null,
      });
      const savedEntry = await entryRepo.save(entry);

      const sessionToken = `VIS-${randomUUID().replace(/-/g, '')}`;
      const session = sessionRepo.create({
        gateEntryId: savedEntry.id,
        visitorUserId: identity.user.id,
        plantId,
        sessionToken,
        mobileNumber: normalizePhone(body.visitorPhone),
        startTime: requestedStart,
        endTime: requestedEnd,
        status: 'PENDING',
        approvalStatus: 'PENDING',
        isActive: false,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        lastLatitude: null,
        lastLongitude: null,
        lastNodeId: null,
        lastNodeLabel: null,
        lastSeenAt: null,
        notes: body.remarks,
        createdBy: req.auth!.userId,
      });
      const savedSession = await sessionRepo.save(session);

      const notification = notificationRepo.create({
        userId: personToMeet.id,
        title: 'Visitor approval pending',
        message: `${body.visitorName} requested access for ${durationHours} hour(s). Access window starts when you approve.`,
        type: 'warning',
        isRead: false,
        link: '/visitor-experience',
        woId: null,
      });
      await notificationRepo.save(notification);
      publishNotificationChange(personToMeet.id);

      return {
        gateEntry: savedEntry,
        session: savedSession,
        visitorCredentials: {
          loginEmail: identity.loginEmail,
          mobileNumber: normalizePhone(body.visitorPhone),
          temporaryPassword: identity.tempPassword,
          qrToken: savedSession.sessionToken,
          durationHours,
          visitStartTime: requestedStart.toISOString(),
          visitEndTime: requestedEnd.toISOString(),
        },
      };
    });

    res.status(201).json(ok(result, 'Temporary visitor session created and sent for approval'));
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.post(['/visitor/approve', '/visitor/approval'], requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const body = visitorApprovalSchema.parse(req.body);
    if (!body.gateEntryId && !body.sessionId) {
      res.status(400).json(fail('sessionId or gateEntryId is required'));
      return;
    }

    const result = await AppDataSource.transaction(async (manager) => {
      const sessionRepo = manager.getRepository(VisitorSessionEntity);
      const entryRepo = manager.getRepository(GateEntryEntity);
      const notificationRepo = manager.getRepository(NotificationEntity);

      const session = body.sessionId
        ? await sessionRepo.findOneBy({ id: body.sessionId })
        : await sessionRepo.findOneBy({ gateEntryId: body.gateEntryId! });

      if (!session) {
        return { status: 404 as const, body: fail('Visitor session not found') };
      }

      const entry = await entryRepo.findOneBy({ id: session.gateEntryId });
      if (!entry) {
        return { status: 404 as const, body: fail('Visitor entry not found') };
      }

      ensurePlantAccess(req, entry.plantId);

      const actorIsPrivileged = isPrivilegedApprover(req.auth!.roles);
      const actorIsAssignedEmployee = entry.personToMeetUserId === req.auth!.userId;
      if (!actorIsPrivileged && !actorIsAssignedEmployee) {
        return { status: 403 as const, body: fail('Only assigned employee or admin/security can approve visitor') };
      }

      const isApprove = body.action === 'APPROVE';
      const now = new Date();
      const fallbackDurationHours = clampDurationHours(
        Math.ceil((session.endTime.getTime() - session.startTime.getTime()) / (60 * 60 * 1000)),
      );
      const durationHours = extractDurationHoursFromEntryData(entry.entryData) ?? fallbackDurationHours;

      if (isApprove) {
        const approvedStart = now;
        const approvedEnd = new Date(approvedStart.getTime() + durationHours * 60 * 60 * 1000);
        session.startTime = approvedStart;
        session.endTime = approvedEnd;
        entry.allowedVisitStartAt = approvedStart;
        entry.allowedVisitEndAt = approvedEnd;
      }

      session.approvalStatus = isApprove ? 'APPROVED' : 'REJECTED';
      session.status = isApprove ? 'APPROVED' : 'REJECTED';
      session.isActive = false;
      session.approvedBy = isApprove ? req.auth!.userId : null;
      session.approvedAt = isApprove ? now : null;
      session.rejectedBy = isApprove ? null : req.auth!.userId;
      session.rejectedAt = isApprove ? null : now;
      session.notes = body.comments ?? session.notes;
      await sessionRepo.save(session);

      entry.approvalStatus = isApprove ? 'APPROVED' : 'REJECTED';
      entry.approvalRespondedAt = now;
      entry.approvalBy = req.auth!.userId;
      entry.approvalComments = body.comments;
      entry.navigationEnabled = isApprove;
      entry.navigationEnabledAt = isApprove ? now : null;
      entry.status = isApprove ? 'APPROVED' : 'REJECTED';

      if (isApprove) {
        if (body.meetingLocationNodeId) {
          entry.currentLocationNodeId = body.meetingLocationNodeId;
        }
        if (body.meetingLocationLabel) {
          entry.currentLocationLabel = body.meetingLocationLabel;
        }
        if (body.meetingDepartmentId) {
          entry.departmentId = body.meetingDepartmentId;
        }

        const nextEntryData = Array.isArray(entry.entryData) ? [...entry.entryData] : [];
        if (body.meetingLocationNodeId) {
          nextEntryData.push({
            fieldName: 'meeting_location_node_id',
            fieldLabel: 'Meeting Location Node',
            fieldType: 'TEXT',
            value: body.meetingLocationNodeId,
          });
        }
        if (body.meetingLocationLabel) {
          nextEntryData.push({
            fieldName: 'meeting_location_label',
            fieldLabel: 'Meeting Location Label',
            fieldType: 'TEXT',
            value: body.meetingLocationLabel,
          });
        }
        if (body.escortUserId) {
          nextEntryData.push({
            fieldName: 'escort_user_id',
            fieldLabel: 'Escort User',
            fieldType: 'TEXT',
            value: body.escortUserId,
          });
        }
        entry.entryData = nextEntryData;
      }

      await entryRepo.save(entry);

      const refreshed = await refreshSessionState({ manager, session });

      const notifyUserIds = Array.from(new Set([entry.recordedBy, session.visitorUserId, body.escortUserId].filter((value): value is string => Boolean(value))));

      if (notifyUserIds.length > 0) {
        const notifications = notifyUserIds.map((userId) =>
          notificationRepo.create({
            userId,
            title: isApprove ? 'Visitor approved' : 'Visitor rejected',
            message: `${entry.visitorName} access request has been ${isApprove ? 'approved' : 'rejected'}.`,
            type: isApprove ? 'success' : 'critical',
            isRead: false,
            link: '/visitor-experience',
            woId: null,
          }),
        );
        await notificationRepo.save(notifications);
        notifyUserIds.forEach((userId) => publishNotificationChange(userId));
      }

      return {
        status: 200 as const,
        body: ok(
          {
            gateEntryId: entry.id,
            sessionId: refreshed.id,
            status: refreshed.status,
            approvalStatus: refreshed.approvalStatus,
            isActive: refreshed.isActive,
            startTime: toIso(refreshed.startTime),
            endTime: toIso(refreshed.endTime),
          },
          `Visitor request ${isApprove ? 'approved' : 'rejected'}`,
        ),
      };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.get('/visitor/session-status', async (req, res, next) => {
  try {
    const lookup = sessionLookupSchema.parse(req.query);

    const result = await AppDataSource.transaction(async (manager) => {
      const session = await findSessionByLookup({ manager, auth: req.auth!, lookup });
      if (!session) {
        return { status: 404 as const, body: fail('Visitor session not found') };
      }

      const entryRepo = manager.getRepository(GateEntryEntity);
      const entry = await entryRepo.findOneBy({ id: session.gateEntryId });
      if (!entry) {
        return { status: 404 as const, body: fail('Visitor entry not found') };
      }

      const actorIsPrivileged = isPrivilegedApprover(req.auth!.roles);
      const actorIsOwner = session.visitorUserId === req.auth!.userId;
      const actorIsRequester = entry.recordedBy === req.auth!.userId;
      const actorIsAssignee = entry.personToMeetUserId === req.auth!.userId;

      if (!actorIsPrivileged && !actorIsOwner && !actorIsRequester && !actorIsAssignee) {
        return { status: 403 as const, body: fail('No permission to access visitor session') };
      }

      ensurePlantAccess(req, session.plantId);

      const refreshed = await refreshSessionState({ manager, session });
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.floor((refreshed.endTime.getTime() - now) / 1000));

      return {
        status: 200 as const,
        body: ok(
          {
            sessionId: refreshed.id,
            gateEntryId: refreshed.gateEntryId,
            sessionToken: refreshed.sessionToken,
            status: refreshed.status,
            approvalStatus: refreshed.approvalStatus,
            isActive: refreshed.isActive,
            accessAllowed: refreshed.status === 'ACTIVE',
            startTime: toIso(refreshed.startTime),
            endTime: toIso(refreshed.endTime),
            remainingSeconds,
            currentLocation: {
              latitude: refreshed.lastLatitude ? Number(refreshed.lastLatitude) : null,
              longitude: refreshed.lastLongitude ? Number(refreshed.lastLongitude) : null,
              nodeId: refreshed.lastNodeId,
              nodeLabel: refreshed.lastNodeLabel,
              lastSeenAt: toIso(refreshed.lastSeenAt),
            },
          },
          'Visitor session status fetched',
        ),
      };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.post('/visitor/update-location', async (req, res, next) => {
  try {
    const body = locationUpdateSchema.parse(req.body);

    const result = await AppDataSource.transaction(async (manager) => {
      const sessionRepo = manager.getRepository(VisitorSessionEntity);
      const trackingRepo = manager.getRepository(VisitorTrackingEntity);
      const navLogRepo = manager.getRepository(VisitorNavigationLogEntity);
      const entryRepo = manager.getRepository(GateEntryEntity);

      const session = body.sessionId
        ? await sessionRepo.findOneBy({ id: body.sessionId })
        : body.sessionToken
          ? await sessionRepo.findOneBy({ sessionToken: body.sessionToken })
          : body.gateEntryId
            ? await sessionRepo.findOneBy({ gateEntryId: body.gateEntryId })
            : null;

      if (!session) {
        return { status: 404 as const, body: fail('Visitor session not found') };
      }

      const entry = await entryRepo.findOneBy({ id: session.gateEntryId });
      if (!entry) {
        return { status: 404 as const, body: fail('Visitor entry not found') };
      }

      ensurePlantAccess(req, session.plantId);

      const actorIsPrivileged = isPrivilegedApprover(req.auth!.roles);
      const actorIsVisitor = session.visitorUserId === req.auth!.userId;
      const actorIsRequester = entry.recordedBy === req.auth!.userId;
      const actorIsAssignee = entry.personToMeetUserId === req.auth!.userId;

      if (!actorIsPrivileged && !actorIsVisitor && !actorIsRequester && !actorIsAssignee) {
        return { status: 403 as const, body: fail('No permission to update visitor location') };
      }

      const refreshed = await refreshSessionState({ manager, session });
      if (refreshed.status !== 'ACTIVE' || !refreshed.isActive) {
        return { status: 409 as const, body: fail('Visitor session is not active in allowed time window') };
      }

      const geoFence = await evaluateGeoFence({
        manager,
        plantId: session.plantId,
        latitude: body.latitude,
        longitude: body.longitude,
      });

      const alertType = geoFence.status === 'IN_RESTRICTED'
        ? 'RESTRICTED_ZONE'
        : geoFence.status === 'OUTSIDE_ALLOWED'
          ? 'OUTSIDE_ALLOWED_ZONE'
          : null;

      const trackedAt = new Date();
      const tracking = trackingRepo.create({
        visitorSessionId: session.id,
        gateEntryId: session.gateEntryId,
        plantId: session.plantId,
        latitude: body.latitude.toFixed(7),
        longitude: body.longitude.toFixed(7),
        nodeId: body.nodeId,
        nodeLabel: body.nodeLabel,
        geoFenceStatus: geoFence.status,
        alertType,
        routeDeviation: geoFence.status !== 'WITHIN',
        source: body.source,
        payload: JSON.stringify({
          violatedFenceId: geoFence.violatedFence?.id ?? null,
          violatedFenceName: geoFence.violatedFence?.fenceName ?? null,
        }),
        trackedAt,
        recordedBy: req.auth!.userId,
      });
      const savedTracking = await trackingRepo.save(tracking);

      const navLog = navLogRepo.create({
        gateEntryId: session.gateEntryId,
        plantId: session.plantId,
        nodeId: body.nodeId,
        nodeLabel: body.nodeLabel,
        latitude: body.latitude.toFixed(7),
        longitude: body.longitude.toFixed(7),
        checkInMode: body.source,
        occurredAt: trackedAt,
        recordedBy: req.auth!.userId,
      });
      await navLogRepo.save(navLog);

      session.lastLatitude = body.latitude.toFixed(7);
      session.lastLongitude = body.longitude.toFixed(7);
      session.lastNodeId = body.nodeId;
      session.lastNodeLabel = body.nodeLabel;
      session.lastSeenAt = trackedAt;
      await sessionRepo.save(session);

      entry.currentLocationNodeId = body.nodeId;
      entry.currentLocationLabel = body.nodeLabel;
      await entryRepo.save(entry);

      if (alertType) {
        await notifySecurityAndAdmins({
          manager,
          plantId: session.plantId,
          title: 'Visitor geo-fence violation',
          message: `${entry.visitorName} triggered ${alertType.replace(/_/g, ' ').toLowerCase()} at ${trackedAt.toLocaleString()}.`,
          link: '/visitor-experience',
        });
      }

      publishVisitorTrackingChange(session.id, {
        gateEntryId: session.gateEntryId,
        latitude: body.latitude,
        longitude: body.longitude,
        nodeId: body.nodeId,
        nodeLabel: body.nodeLabel,
        geoFenceStatus: geoFence.status,
        alertType,
        trackedAt: trackedAt.toISOString(),
      });

      return {
        status: 201 as const,
        body: ok(
          {
            tracking: savedTracking,
            geoFenceStatus: geoFence.status,
            alertType,
          },
          'Visitor location updated',
        ),
      };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.get('/navigation/route', async (req, res, next) => {
  try {
    const query = routeQuerySchema.parse(req.query);

    const result = await AppDataSource.transaction(async (manager) => {
      const session = await findSessionByLookup({
        manager,
        auth: req.auth!,
        lookup: {
          sessionToken: query.sessionToken,
          sessionId: query.sessionId,
          gateEntryId: query.gateEntryId,
        },
      });

      if (!session) {
        return { status: 404 as const, body: fail('Visitor session not found') };
      }

      const entryRepo = manager.getRepository(GateEntryEntity);
      const coordinateRepo = manager.getRepository(PlantCoordinateEntity);
      const pathwayRepo = manager.getRepository(PathwayEntity);
      const geoFenceRepo = manager.getRepository(GeoFenceEntity);

      const entry = await entryRepo.findOneBy({ id: session.gateEntryId });
      if (!entry) {
        return { status: 404 as const, body: fail('Visitor entry not found') };
      }

      ensurePlantAccess(req, session.plantId);

      const actorIsPrivileged = isPrivilegedApprover(req.auth!.roles);
      const actorIsVisitor = session.visitorUserId === req.auth!.userId;
      const actorIsRequester = entry.recordedBy === req.auth!.userId;
      const actorIsAssignee = entry.personToMeetUserId === req.auth!.userId;

      if (!actorIsPrivileged && !actorIsVisitor && !actorIsRequester && !actorIsAssignee) {
        return { status: 403 as const, body: fail('No permission to view visitor route') };
      }

      const refreshed = await refreshSessionState({ manager, session });
      if (refreshed.approvalStatus !== 'APPROVED') {
        return { status: 409 as const, body: fail('Navigation route is available only after approval') };
      }

      const [coordinates, pathways, geoFences] = await Promise.all([
        coordinateRepo.find({ where: { plantId: session.plantId ?? IsNull(), isActive: true }, order: { createdAt: 'ASC' } }),
        pathwayRepo.find({ where: { plantId: session.plantId ?? IsNull(), isActive: true }, order: { createdAt: 'ASC' } }),
        geoFenceRepo.find({ where: { plantId: session.plantId ?? IsNull(), isActive: true }, order: { createdAt: 'ASC' } }),
      ]);

      if (coordinates.length === 0) {
        return { status: 400 as const, body: fail('No plant coordinates configured for navigation') };
      }

      const graph = buildRouteGraph({ coordinates, pathways });

      const sourceCoordinate = query.fromCoordinateId
        ? graph.coordinateMap.get(query.fromCoordinateId)
        : (() => {
            if (refreshed.lastLatitude && refreshed.lastLongitude) {
              const currentPoint = {
                latitude: Number(refreshed.lastLatitude),
                longitude: Number(refreshed.lastLongitude),
              };
              let best: PlantCoordinateEntity | null = null;
              let bestDistance = Number.POSITIVE_INFINITY;
              coordinates.forEach((coordinate) => {
                const distance = haversineMeters(currentPoint, {
                  latitude: Number(coordinate.latitude),
                  longitude: Number(coordinate.longitude),
                });
                if (distance < bestDistance) {
                  best = coordinate;
                  bestDistance = distance;
                }
              });
              if (best) return best;
            }

            return coordinates.find((coordinate) => coordinate.gateId === entry.gateId)
              ?? coordinates.find((coordinate) => coordinate.locationType === 'GATE')
              ?? coordinates[0];
          })();

      const destinationCoordinate = query.toCoordinateId
        ? graph.coordinateMap.get(query.toCoordinateId)
        : coordinates.find((coordinate) => entry.moduleId && coordinate.moduleId === entry.moduleId)
          ?? coordinates.find((coordinate) => entry.departmentId && coordinate.departmentId === entry.departmentId)
          ?? coordinates[coordinates.length - 1];

      if (!sourceCoordinate || !destinationCoordinate) {
        return { status: 400 as const, body: fail('Unable to determine source or destination coordinate') };
      }

      const shortest = shortestPathFromGraph({
        sourceId: sourceCoordinate.id,
        destinationId: destinationCoordinate.id,
        adjacency: graph.adjacency,
      });

      const routeCoordinates = shortest.nodeIds
        .map((nodeId) => graph.coordinateMap.get(nodeId))
        .filter((row): row is PlantCoordinateEntity => Boolean(row));

      const pathwayById = new Map(pathways.map((pathway) => [pathway.id, pathway]));
      const routePathways = shortest.pathwayIds
        .map((pathwayId) => pathwayById.get(pathwayId))
        .filter((row): row is PathwayEntity => Boolean(row));

      const steps = routeCoordinates.slice(1).map((coordinate, index) => {
        const previous = routeCoordinates[index];
        return `Move from ${previous.locationName} to ${coordinate.locationName}`;
      });

      return {
        status: 200 as const,
        body: ok(
          {
            sessionId: refreshed.id,
            gateEntryId: refreshed.gateEntryId,
            sessionStatus: refreshed.status,
            source: sourceCoordinate,
            destination: destinationCoordinate,
            routeCoordinates,
            routePathways,
            restrictedZones: geoFences
              .filter((fence) => fence.fenceType.toUpperCase() === 'RESTRICTED')
              .map((fence) => ({
                id: fence.id,
                fenceName: fence.fenceName,
                polygonPoints: fence.polygonPoints,
              })),
            steps,
          },
          'Smart navigation route generated',
        ),
      };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

smartVisitorRouter.get('/visitor/tracking/stream', async (req, res, next) => {
  try {
    const lookup = sessionLookupSchema.parse(req.query);

    const session = await AppDataSource.getRepository(VisitorSessionEntity).findOne({
      where: lookup.sessionId
        ? { id: lookup.sessionId }
        : lookup.sessionToken
          ? { sessionToken: lookup.sessionToken }
          : lookup.gateEntryId
            ? { gateEntryId: lookup.gateEntryId }
            : { visitorUserId: req.auth!.userId },
      order: { createdAt: 'DESC' },
    });

    if (!session) {
      res.status(404).json(fail('Visitor session not found'));
      return;
    }

    ensurePlantAccess(req, session.plantId);

    const entry = await AppDataSource.getRepository(GateEntryEntity).findOneBy({ id: session.gateEntryId });
    if (!entry) {
      res.status(404).json(fail('Visitor entry not found'));
      return;
    }

    const actorIsPrivileged = isPrivilegedApprover(req.auth!.roles);
    const actorIsVisitor = session.visitorUserId === req.auth!.userId;
    const actorIsRequester = entry.recordedBy === req.auth!.userId;
    const actorIsAssignee = entry.personToMeetUserId === req.auth!.userId;

    if (!actorIsPrivileged && !actorIsVisitor && !actorIsRequester && !actorIsAssignee) {
      res.status(403).json(fail('No permission to subscribe to visitor tracking stream'));
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const unsubscribe = subscribeVisitorTrackingStream(session.id, res);
    const heartbeat = setInterval(() => {
      res.write(`: ping ${Date.now()}\n\n`);
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  } catch (error) {
    next(error);
  }
});
