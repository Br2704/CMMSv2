import { Router } from 'express';
import { Brackets, In, IsNull } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import {
  DepartmentEntity,
  GateEntity,
  GateEntryEntity,
  MachineModuleEntity,
  NotificationEntity,
  PlantEntity,
  PlantLayoutEntity,
  ProfileEntity,
  UserEntity,
  UserRoleEntity,
  VisitorExperienceContentEntity,
  VisitorNavigationLogEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { resolveScopedPlantId } from '../../utils/plantScope';
import { publishNotificationChange } from '../notifications/notification-stream';

type LayoutNode = {
  id: string;
  label: string;
  nodeType: string;
  refId?: string | null;
  x?: number;
  y?: number;
};

type LayoutEdge = {
  fromNodeId: string;
  toNodeId: string;
  distance?: number;
  directional?: boolean;
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

const optionalDateTimeString = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}, z.string().datetime({ offset: true }).nullable());

const contentSchema = z.object({
  plantId: optionalUuid,
  pageTitle: z.string().min(1).max(200).default('Welcome to JK Fenner'),
  companyOverview: optionalString,
  contactName: optionalString,
  contactEmail: optionalString,
  contactPhone: optionalString,
  contactAddress: optionalString,
  heroHighlights: z.array(z.record(z.unknown())).optional().nullable(),
  products: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        description: optionalString,
        imageUrl: optionalString,
        plantIds: z.array(z.string().uuid()).optional().nullable(),
        departmentIds: z.array(z.string().uuid()).optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

const layoutSchema = z.object({
  plantId: z.string().uuid(),
  layoutName: z.string().min(1).max(120).default('Plant Layout'),
  svgMarkup: optionalString,
  mapData: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
  publishNow: z.boolean().optional().default(true),
});

const visitorRequestSchema = z.object({
  gateId: optionalUuid,
  plantId: z.string().uuid(),
  departmentId: optionalUuid,
  moduleId: optionalUuid,
  personToMeetUserId: z.string().uuid(),
  visitorName: z.string().min(1).max(120),
  visitorCompany: optionalString,
  visitorPhone: optionalString,
  purpose: z.string().min(1).max(500),
  desiredVisitAt: optionalDateTimeString,
  idProofType: optionalString,
  idProofNumber: optionalString,
  vehicleNumber: optionalString,
  remarks: optionalString,
});

const visitorApprovalSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  comments: optionalString,
});

const navigationCheckInSchema = z.object({
  nodeId: optionalString,
  nodeLabel: optionalString,
  latitude: z.number().finite().min(-90).max(90).optional().nullable(),
  longitude: z.number().finite().min(-180).max(180).optional().nullable(),
  checkInMode: z.enum(['MANUAL', 'GPS', 'CHECKPOINT']).default('MANUAL'),
});

const visitorRequestListFilterSchema = z.object({
  plantId: optionalUuid,
  scope: z.enum(['my-requests', 'approvals', 'all']).default('my-requests'),
  approvalStatus: optionalString,
  status: optionalString,
  personToMeetUserId: optionalUuid,
});

const routePreviewQuerySchema = z.object({
  fromNodeId: optionalString,
  toNodeId: optionalString,
});

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPrivilegedApprover(roles: string[]): boolean {
  const normalizedRoles = roles.map((role) => role.toUpperCase());
  return normalizedRoles.some((role) => ['ROOT_ADMIN', 'SUPERADMIN', 'ADMIN', 'SECURITY', 'SECURITY_USER'].includes(role));
}

function parseLayoutData(input: unknown): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  if (!input || typeof input !== 'object') {
    return { nodes: [], edges: [] };
  }

  const mapData = input as { nodes?: unknown; edges?: unknown };
  const nodes: LayoutNode[] = [];

  if (Array.isArray(mapData.nodes)) {
    mapData.nodes.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const node = row as Record<string, unknown>;
      const id = normalizeString(node.id);
      const label = normalizeString(node.label);
      const nodeType = normalizeString(node.nodeType) ?? 'CHECKPOINT';
      if (!id || !label) return;
      nodes.push({
        id,
        label,
        nodeType,
        refId: normalizeString(node.refId),
        x: typeof node.x === 'number' ? node.x : undefined,
        y: typeof node.y === 'number' ? node.y : undefined,
      });
    });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: LayoutEdge[] = [];

  if (Array.isArray(mapData.edges)) {
    mapData.edges.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const edge = row as Record<string, unknown>;
      const fromNodeId = normalizeString(edge.fromNodeId);
      const toNodeId = normalizeString(edge.toNodeId);
      if (!fromNodeId || !toNodeId) return;
      if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) return;
      edges.push({
        fromNodeId,
        toNodeId,
        distance: typeof edge.distance === 'number' && Number.isFinite(edge.distance) ? edge.distance : 1,
        directional: Boolean(edge.directional),
      });
    });
  }

  return { nodes, edges };
}

function buildDefaultLayoutFromHierarchy(input: {
  departments: DepartmentEntity[];
  modules: MachineModuleEntity[];
}) {
  const nodes: LayoutNode[] = [
    {
      id: 'ENTRANCE_MAIN',
      label: 'Main Gate Entrance',
      nodeType: 'ENTRANCE',
      refId: null,
      x: 80,
      y: 80,
    },
  ];

  const edges: LayoutEdge[] = [];

  input.departments.forEach((department, index) => {
    const departmentNodeId = `DEPT_${department.id}`;
    nodes.push({
      id: departmentNodeId,
      label: `${department.code} - ${department.name}`,
      nodeType: 'DEPARTMENT',
      refId: department.id,
      x: 240 + (index % 4) * 220,
      y: 120 + Math.floor(index / 4) * 220,
    });

    edges.push({ fromNodeId: 'ENTRANCE_MAIN', toNodeId: departmentNodeId, distance: 1 });

    const linkedModules = input.modules.filter((module) => module.departmentId === department.id);
    linkedModules.forEach((module, moduleIndex) => {
      const moduleNodeId = `MODULE_${module.id}`;
      nodes.push({
        id: moduleNodeId,
        label: module.code ? `${module.code} - ${module.name}` : module.name,
        nodeType: 'MODULE',
        refId: module.id,
        x: (nodes.find((node) => node.id === departmentNodeId)?.x ?? 240) + (moduleIndex % 2) * 120,
        y: (nodes.find((node) => node.id === departmentNodeId)?.y ?? 120) + 80 + Math.floor(moduleIndex / 2) * 80,
      });
      edges.push({ fromNodeId: departmentNodeId, toNodeId: moduleNodeId, distance: 1 });
    });
  });

  const maxX = Math.max(...nodes.map((node) => node.x ?? 0), 960);
  const maxY = Math.max(...nodes.map((node) => node.y ?? 0), 540);

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX + 140}" height="${maxY + 140}" viewBox="0 0 ${maxX + 140} ${maxY + 140}">`,
    '<rect x="0" y="0" width="100%" height="100%" rx="20" fill="#f8fafc" />',
    ...edges.map((edge) => {
      const from = nodes.find((node) => node.id === edge.fromNodeId);
      const to = nodes.find((node) => node.id === edge.toNodeId);
      if (!from || !to) return '';
      return `<line x1="${(from.x ?? 0) + 18}" y1="${(from.y ?? 0) + 18}" x2="${(to.x ?? 0) + 18}" y2="${(to.y ?? 0) + 18}" stroke="#94a3b8" stroke-width="2" />`;
    }),
    ...nodes.map((node) => {
      const fill = node.nodeType === 'ENTRANCE' ? '#0f766e' : node.nodeType === 'DEPARTMENT' ? '#2563eb' : '#475569';
      return `<g><circle cx="${(node.x ?? 0) + 18}" cy="${(node.y ?? 0) + 18}" r="18" fill="${fill}" /><text x="${(node.x ?? 0) + 46}" y="${(node.y ?? 0) + 22}" font-size="12" font-family="Arial, sans-serif" fill="#0f172a">${node.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></g>`;
    }),
    '</svg>',
  ].join('');

  return {
    nodes,
    edges,
    svgMarkup,
  };
}

function shortestPath(nodes: LayoutNode[], edges: LayoutEdge[], sourceId: string, targetId: string): string[] {
  if (sourceId === targetId) return [sourceId];

  const adjacency = new Map<string, Array<{ to: string; weight: number }>>();
  nodes.forEach((node) => adjacency.set(node.id, []));

  edges.forEach((edge) => {
    const weight = edge.distance && edge.distance > 0 ? edge.distance : 1;
    adjacency.get(edge.fromNodeId)?.push({ to: edge.toNodeId, weight });
    if (!edge.directional) {
      adjacency.get(edge.toNodeId)?.push({ to: edge.fromNodeId, weight });
    }
  });

  const distance = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set(nodes.map((node) => node.id));

  nodes.forEach((node) => {
    distance.set(node.id, Number.POSITIVE_INFINITY);
    previous.set(node.id, null);
  });
  distance.set(sourceId, 0);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    unvisited.forEach((nodeId) => {
      const d = distance.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (d < currentDistance) {
        currentDistance = d;
        current = nodeId;
      }
    });

    const currentNodeId = current;
    if (!currentNodeId || currentDistance === Number.POSITIVE_INFINITY) break;
    if (currentNodeId === targetId) break;

    unvisited.delete(currentNodeId);
    const neighbors = adjacency.get(currentNodeId) ?? [];
    neighbors.forEach((neighbor) => {
      if (!unvisited.has(neighbor.to)) return;
      const alternate = (distance.get(currentNodeId) ?? Number.POSITIVE_INFINITY) + neighbor.weight;
      if (alternate < (distance.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
        distance.set(neighbor.to, alternate);
        previous.set(neighbor.to, currentNodeId);
      }
    });
  }

  const path: string[] = [];
  let cursor: string | null = targetId;
  while (cursor) {
    path.unshift(cursor);
    cursor = previous.get(cursor) ?? null;
  }

  if (path[0] !== sourceId) {
    return [];
  }

  return path;
}

function toVisitorStatusText(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'PENDING') return 'Pending Approval';
  if (normalized === 'APPROVED') return 'Approved';
  if (normalized === 'REJECTED') return 'Rejected';
  if (normalized === 'IN') return 'Inside Plant';
  if (normalized === 'OUT') return 'Exited';
  return normalized;
}

export const visitorExperienceRouter = Router();
visitorExperienceRouter.use(requireAuth);

visitorExperienceRouter.get('/visitor-experience/content', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, requestedPlantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const contentRepo = AppDataSource.getRepository(VisitorExperienceContentEntity);
    const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
    const plantRepo = AppDataSource.getRepository(PlantEntity);

    const content = await contentRepo.findOne({
      where: resolvedPlantId
        ? [{ plantId: resolvedPlantId, isActive: true }, { plantId: IsNull(), isActive: true }]
        : { plantId: IsNull(), isActive: true },
      order: { plantId: 'DESC', updatedAt: 'DESC' },
      relations: { plant: true },
    });

    const products = (content?.products ?? []).map((product) => ({ ...product }));
    const departmentIds = Array.from(
      new Set(
        products
          .flatMap((product) => {
            const raw = (product as { departmentIds?: unknown }).departmentIds;
            return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];
          })
          .filter(Boolean),
      ),
    );

    const departments = departmentIds.length > 0 ? await departmentRepo.find({ where: { id: In(departmentIds) } }) : [];
    const departmentMap = new Map(departments.map((department) => [department.id, department]));

    const enrichedProducts = products.map((product) => {
      const productDepartmentIds = Array.isArray((product as { departmentIds?: unknown }).departmentIds)
        ? ((product as { departmentIds: unknown[] }).departmentIds.filter((value): value is string => typeof value === 'string'))
        : [];

      return {
        ...product,
        linkedDepartments: productDepartmentIds
          .map((departmentId) => {
            const department = departmentMap.get(departmentId);
            if (!department) return null;
            return {
              id: department.id,
              code: department.code,
              name: department.name,
              plantId: department.plantId,
            };
          })
          .filter((row): row is { id: string; code: string; name: string; plantId: string | null } => Boolean(row)),
      };
    });

    const plant = resolvedPlantId ? await plantRepo.findOneBy({ id: resolvedPlantId }) : null;

    res.json(
      ok(
        {
          id: content?.id ?? null,
          plantId: resolvedPlantId,
          pageTitle: content?.pageTitle ?? (plant?.plantName ? `Welcome to ${plant.plantName}` : 'Welcome to JK Fenner'),
          companyOverview:
            content?.companyOverview ??
            'JK Fenner combines legacy industrial excellence with modern digital operations for safer, faster, and smarter maintenance.',
          contactName: content?.contactName ?? null,
          contactEmail: content?.contactEmail ?? null,
          contactPhone: content?.contactPhone ?? null,
          contactAddress: content?.contactAddress ?? null,
          heroHighlights: content?.heroHighlights ?? [],
          products: enrichedProducts,
          updatedAt: content?.updatedAt ?? null,
        },
        'Visitor experience content fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.put('/visitor-experience/content', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = contentSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const repo = AppDataSource.getRepository(VisitorExperienceContentEntity);
    let entity = await repo.findOne({ where: resolvedPlantId ? { plantId: resolvedPlantId } : { plantId: IsNull() } });

    if (!entity) {
      entity = repo.create({
        plantId: resolvedPlantId,
        createdBy: req.auth!.userId,
      });
    }

    entity.pageTitle = body.pageTitle;
    entity.companyOverview = body.companyOverview;
    entity.contactName = body.contactName;
    entity.contactEmail = body.contactEmail;
    entity.contactPhone = body.contactPhone;
    entity.contactAddress = body.contactAddress;
    entity.heroHighlights = body.heroHighlights ?? null;
    entity.products = body.products ?? null;
    entity.isActive = body.isActive ?? true;
    entity.createdBy = req.auth!.userId;

    const saved = await repo.save(entity);
    res.json(ok(saved, 'Visitor experience content saved'));
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.get('/visitor-experience/layout', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, requestedPlantId ?? null);

    if (!resolvedPlantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    ensurePlantAccess(req, resolvedPlantId);

    const layoutRepo = AppDataSource.getRepository(PlantLayoutEntity);
    const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
    const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);

    const existingLayout = await layoutRepo.findOne({
      where: { plantId: resolvedPlantId, isActive: true },
      order: { updatedAt: 'DESC' },
    });

    const departments = await departmentRepo.find({ where: { plantId: resolvedPlantId, isActive: true }, order: { name: 'ASC' } });
    const modules = await moduleRepo.find({ where: { plantId: resolvedPlantId, isActive: true }, order: { name: 'ASC' } });

    if (!existingLayout) {
      const fallbackLayout = buildDefaultLayoutFromHierarchy({ departments, modules });
      res.json(
        ok(
          {
            id: null,
            plantId: resolvedPlantId,
            layoutName: 'Generated Plant Layout',
            version: 1,
            svgMarkup: fallbackLayout.svgMarkup,
            mapData: {
              nodes: fallbackLayout.nodes,
              edges: fallbackLayout.edges,
            },
            isGenerated: true,
            hierarchy: {
              departments: departments.map((department) => ({ id: department.id, code: department.code, name: department.name })),
              modules: modules.map((module) => ({ id: module.id, code: module.code, name: module.name, departmentId: module.departmentId })),
            },
          },
          'Plant layout fetched',
        ),
      );
      return;
    }

    const parsedLayout = parseLayoutData(existingLayout.mapData ?? null);
    const generatedSvg = existingLayout.svgMarkup ?? buildDefaultLayoutFromHierarchy({ departments, modules }).svgMarkup;

    res.json(
      ok(
        {
          id: existingLayout.id,
          plantId: existingLayout.plantId,
          layoutName: existingLayout.layoutName,
          version: existingLayout.version,
          svgMarkup: generatedSvg,
          mapData: {
            nodes: parsedLayout.nodes,
            edges: parsedLayout.edges,
          },
          isGenerated: false,
          updatedAt: existingLayout.updatedAt,
          hierarchy: {
            departments: departments.map((department) => ({ id: department.id, code: department.code, name: department.name })),
            modules: modules.map((module) => ({ id: module.id, code: module.code, name: module.name, departmentId: module.departmentId })),
          },
        },
        'Plant layout fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.put('/visitor-experience/layout', requireRole(['SUPERADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = layoutSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId);

    if (!resolvedPlantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    ensurePlantAccess(req, resolvedPlantId);

    const parsedMapData = parseLayoutData(body.mapData ?? null);

    const repo = AppDataSource.getRepository(PlantLayoutEntity);
    let entity = await repo.findOne({ where: { plantId: resolvedPlantId, isActive: true }, order: { updatedAt: 'DESC' } });

    if (!entity) {
      entity = repo.create({
        plantId: resolvedPlantId,
        createdBy: req.auth!.userId,
      });
    }

    entity.layoutName = body.layoutName;
    entity.version = (entity.version ?? 0) + 1;
    entity.svgMarkup = body.svgMarkup;
    entity.mapData = {
      nodes: parsedMapData.nodes,
      edges: parsedMapData.edges,
    };
    entity.isActive = body.isActive ?? true;
    entity.publishedAt = body.publishNow ? new Date() : entity.publishedAt;
    entity.createdBy = req.auth!.userId;

    const saved = await repo.save(entity);
    res.json(ok(saved, 'Plant layout saved'));
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.post('/visitor-requests', requirePermission('GATES', 'CREATE'), async (req, res, next) => {
  try {
    const body = visitorRequestSchema.parse(req.body);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, body.plantId);

    if (!resolvedPlantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }

    ensurePlantAccess(req, resolvedPlantId);

    const gateRepo = AppDataSource.getRepository(GateEntity);
    const userRepo = AppDataSource.getRepository(UserEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);
    const entryRepo = AppDataSource.getRepository(GateEntryEntity);
    const notificationRepo = AppDataSource.getRepository(NotificationEntity);

    const personToMeet = await userRepo.findOneBy({ id: body.personToMeetUserId });
    if (!personToMeet) {
      res.status(404).json(fail('Requested employee not found'));
      return;
    }

    const personProfile = await profileRepo.findOneBy({ userId: body.personToMeetUserId });
    if (personProfile?.plantId && personProfile.plantId !== resolvedPlantId) {
      res.status(400).json(fail('Selected employee is not mapped to the selected plant'));
      return;
    }

    const gate = body.gateId
      ? await gateRepo.findOneBy({ id: body.gateId, isActive: true })
      : await gateRepo.findOne({ where: { plantId: resolvedPlantId, isActive: true }, order: { createdAt: 'ASC' } });

    if (!gate) {
      res.status(400).json(fail('No active gate found for the selected plant'));
      return;
    }

    if (gate.plantId && gate.plantId !== resolvedPlantId) {
      res.status(400).json(fail('Selected gate does not belong to the selected plant'));
      return;
    }

    const created = entryRepo.create({
      gateId: gate.id,
      plantId: resolvedPlantId,
      departmentId: body.departmentId,
      moduleId: body.moduleId,
      machineId: null,
      templateId: null,
      visitorName: body.visitorName,
      visitorCompany: body.visitorCompany,
      visitorPhone: body.visitorPhone,
      visitorType: 'VISITOR_REQUEST',
      purpose: body.purpose,
      personToMeet: personToMeet.fullName ?? personToMeet.email,
      personToMeetUserId: body.personToMeetUserId,
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
          fieldName: 'desired_visit_at',
          fieldLabel: 'Desired Visit At',
          fieldType: 'DATETIME',
          value: body.desiredVisitAt,
        },
      ],
      qrCodeValue: null,
      duplicateDetected: false,
      blacklistAlert: false,
      watchlistAlert: false,
      entryTime: new Date(),
      exitTime: null,
      badgeNumber: null,
      remarks: body.remarks,
      recordedBy: req.auth!.userId,
      exitApprovedBy: null,
      exitRemarks: null,
      status: 'PENDING',
      approvalStatus: 'PENDING',
      approvalRequestedAt: new Date(),
      approvalRespondedAt: null,
      approvalBy: null,
      approvalComments: null,
      navigationEnabled: false,
      navigationEnabledAt: null,
      desiredVisitAt: body.desiredVisitAt ? new Date(body.desiredVisitAt) : null,
      currentLocationNodeId: null,
      currentLocationLabel: null,
    });

    const saved = await entryRepo.save(created);

    const approvalNotification = notificationRepo.create({
      userId: body.personToMeetUserId,
      title: 'Visitor approval required',
      message: `${body.visitorName} requested to visit ${personToMeet.fullName ?? 'you'} at the plant.`,
      type: 'warning',
      isRead: false,
      link: '/security-gate',
      woId: null,
    });
    await notificationRepo.save(approvalNotification);
    publishNotificationChange(body.personToMeetUserId);

    const enriched = await entryRepo.findOne({
      where: { id: saved.id },
      relations: {
        plant: true,
        gate: true,
        department: true,
        module: true,
        recordedByUser: true,
        personToMeetUser: true,
        approvalByUser: true,
      },
    });

    res.status(201).json(ok(enriched ?? saved, 'Visitor request created'));
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.get('/visitor-requests', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const filters = visitorRequestListFilterSchema.parse(req.query);

    const requestedPlantId = filters.plantId;
    const resolvedPlantId = resolveScopedPlantId(req.auth!, requestedPlantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const repo = AppDataSource.getRepository(GateEntryEntity);
    const qb = repo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.plant', 'plant')
      .leftJoinAndSelect('entry.gate', 'gate')
      .leftJoinAndSelect('entry.department', 'department')
      .leftJoinAndSelect('entry.module', 'module')
      .leftJoinAndSelect('entry.recordedByUser', 'recordedByUser')
      .leftJoinAndSelect('entry.personToMeetUser', 'personToMeetUser')
      .leftJoinAndSelect('entry.approvalByUser', 'approvalByUser')
      .where(new Brackets((where) => {
        where.where('entry.approval_status <> :notRequired', { notRequired: 'NOT_REQUIRED' });
        where.orWhere('entry.visitor_type LIKE :visitorType', { visitorType: 'VISITOR%' });
      }));

    if (resolvedPlantId) {
      qb.andWhere('entry.plant_id = :plantId', { plantId: resolvedPlantId });
    } else if (!req.auth?.accessAllPlants) {
      const plantIds = req.auth?.plantIds ?? [];
      if (plantIds.length === 0) {
        res.json(ok([], 'Visitor requests fetched', buildPagination(query.page, query.limit, 0)));
        return;
      }
      qb.andWhere('entry.plant_id IN (:...plantIds)', { plantIds });
    }

    const roleRestrictedAllScope = !isPrivilegedApprover(req.auth!.roles) && filters.scope === 'all';

    if (filters.scope === 'my-requests' || roleRestrictedAllScope) {
      qb.andWhere('entry.recorded_by = :actorUserId', { actorUserId: req.auth!.userId });
    }

    if (filters.scope === 'approvals') {
      qb.andWhere('entry.person_to_meet_user_id = :actorUserId', { actorUserId: req.auth!.userId });
    }

    if (filters.personToMeetUserId) {
      qb.andWhere('entry.person_to_meet_user_id = :personToMeetUserId', { personToMeetUserId: filters.personToMeetUserId });
    }

    if (filters.approvalStatus) {
      qb.andWhere('LOWER(entry.approval_status) = :approvalStatus', { approvalStatus: filters.approvalStatus.toLowerCase() });
    }

    if (filters.status) {
      qb.andWhere('LOWER(entry.status) = :status', { status: filters.status.toLowerCase() });
    }

    if (query.search) {
      const searchTerm = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((search) => {
          search.where('LOWER(entry.visitor_name) LIKE :search', { search: searchTerm });
          search.orWhere("LOWER(COALESCE(entry.visitor_company, '')) LIKE :search", { search: searchTerm });
          search.orWhere("LOWER(COALESCE(entry.purpose, '')) LIKE :search", { search: searchTerm });
          search.orWhere("LOWER(COALESCE(entry.person_to_meet, '')) LIKE :search", { search: searchTerm });
        }),
      );
    }

    qb.orderBy('entry.approvalRequestedAt', 'DESC').addOrderBy('entry.createdAt', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    res.json(ok(rows, 'Visitor requests fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.patch('/visitor-requests/:id/approval', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = visitorApprovalSchema.parse(req.body);

    const entryRepo = AppDataSource.getRepository(GateEntryEntity);
    const notificationRepo = AppDataSource.getRepository(NotificationEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);
    const profileRepo = AppDataSource.getRepository(ProfileEntity);

    const entry = await entryRepo.findOne({
      where: { id: params.id },
      relations: { personToMeetUser: true, recordedByUser: true },
    });

    if (!entry) {
      res.status(404).json(fail('Visitor request not found'));
      return;
    }

    ensurePlantAccess(req, entry.plantId);

    if (entry.approvalStatus === 'NOT_REQUIRED') {
      res.status(409).json(fail('This gate entry is not configured for approval flow'));
      return;
    }

    const actorIsAssignedEmployee = entry.personToMeetUserId === req.auth!.userId;
    const actorIsPrivileged = isPrivilegedApprover(req.auth!.roles);

    if (!actorIsAssignedEmployee && !actorIsPrivileged) {
      res.status(403).json(fail('Only the assigned employee or admin/security roles can review this request'));
      return;
    }

    const isApprove = body.action === 'APPROVE';
    entry.approvalStatus = isApprove ? 'APPROVED' : 'REJECTED';
    entry.approvalRespondedAt = new Date();
    entry.approvalBy = req.auth!.userId;
    entry.approvalComments = body.comments;
    entry.navigationEnabled = isApprove;
    entry.navigationEnabledAt = isApprove ? new Date() : null;
    entry.status = isApprove ? 'APPROVED' : 'REJECTED';

    await entryRepo.save(entry);

    const notificationTargets = new Set<string>();
    if (entry.recordedBy) notificationTargets.add(entry.recordedBy);

    if (entry.plantId && isApprove) {
      const securityRoles = await roleRepo.find({ where: [{ role: 'SECURITY' }, { role: 'SECURITY_USER' }] });
      const securityUserIds = securityRoles.map((role) => role.userId);
      if (securityUserIds.length > 0) {
        const securityProfiles = await profileRepo.find({ where: securityUserIds.map((userId) => ({ userId })) });
        securityProfiles
          .filter((profile) => profile.plantId === entry.plantId)
          .forEach((profile) => notificationTargets.add(profile.userId));
      }
    }

    notificationTargets.delete(req.auth!.userId);

    if (notificationTargets.size > 0) {
      const notifications = Array.from(notificationTargets).map((userId) =>
        notificationRepo.create({
          userId,
          title: isApprove ? 'Visitor request approved' : 'Visitor request rejected',
          message: `${entry.visitorName}'s request is ${toVisitorStatusText(entry.approvalStatus).toLowerCase()}.`,
          type: isApprove ? 'success' : 'critical',
          isRead: false,
          link: '/security-gate',
          woId: null,
        }),
      );
      await notificationRepo.save(notifications);
      notificationTargets.forEach((userId) => publishNotificationChange(userId));
    }

    const updated = await entryRepo.findOne({
      where: { id: entry.id },
      relations: {
        plant: true,
        gate: true,
        department: true,
        module: true,
        recordedByUser: true,
        personToMeetUser: true,
        approvalByUser: true,
      },
    });

    res.json(ok(updated ?? entry, `Visitor request ${isApprove ? 'approved' : 'rejected'}`));
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.post('/visitor-requests/:id/navigation-checkins', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = navigationCheckInSchema.parse(req.body);

    const entryRepo = AppDataSource.getRepository(GateEntryEntity);
    const navLogRepo = AppDataSource.getRepository(VisitorNavigationLogEntity);

    const entry = await entryRepo.findOneBy({ id: params.id });
    if (!entry) {
      res.status(404).json(fail('Visitor request not found'));
      return;
    }

    ensurePlantAccess(req, entry.plantId);

    const actorIsRequester = entry.recordedBy === req.auth!.userId;
    const actorIsAssignee = entry.personToMeetUserId === req.auth!.userId;
    const actorIsPrivileged = isPrivilegedApprover(req.auth!.roles);
    if (!actorIsRequester && !actorIsAssignee && !actorIsPrivileged) {
      res.status(403).json(fail('No permission to update visitor navigation for this request'));
      return;
    }

    if (entry.approvalStatus !== 'APPROVED' || !entry.navigationEnabled) {
      res.status(409).json(fail('Navigation is available only after request approval'));
      return;
    }

    const log = navLogRepo.create({
      gateEntryId: entry.id,
      plantId: entry.plantId,
      nodeId: body.nodeId,
      nodeLabel: body.nodeLabel,
      latitude: body.latitude === undefined || body.latitude === null ? null : body.latitude.toFixed(7),
      longitude: body.longitude === undefined || body.longitude === null ? null : body.longitude.toFixed(7),
      checkInMode: body.checkInMode,
      occurredAt: new Date(),
      recordedBy: req.auth!.userId,
    });

    const savedLog = await navLogRepo.save(log);

    entry.currentLocationNodeId = body.nodeId;
    entry.currentLocationLabel = body.nodeLabel;
    await entryRepo.save(entry);

    res.status(201).json(ok(savedLog, 'Navigation check-in recorded'));
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.get('/visitor-requests/:id/navigation', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const query = routePreviewQuerySchema.parse(req.query);

    const entryRepo = AppDataSource.getRepository(GateEntryEntity);
    const layoutRepo = AppDataSource.getRepository(PlantLayoutEntity);
    const departmentRepo = AppDataSource.getRepository(DepartmentEntity);
    const moduleRepo = AppDataSource.getRepository(MachineModuleEntity);

    const entry = await entryRepo.findOne({
      where: { id: params.id },
      relations: { department: true, module: true, plant: true },
    });

    if (!entry) {
      res.status(404).json(fail('Visitor request not found'));
      return;
    }

    ensurePlantAccess(req, entry.plantId);

    const actorIsRequester = entry.recordedBy === req.auth!.userId;
    const actorIsAssignee = entry.personToMeetUserId === req.auth!.userId;
    const actorIsPrivileged = isPrivilegedApprover(req.auth!.roles);
    if (!actorIsRequester && !actorIsAssignee && !actorIsPrivileged) {
      res.status(403).json(fail('No permission to view navigation for this request'));
      return;
    }

    if (entry.approvalStatus !== 'APPROVED' || !entry.navigationEnabled) {
      res.status(409).json(fail('Navigation is enabled only after approval'));
      return;
    }

    if (!entry.plantId) {
      res.status(400).json(fail('Visitor request is missing plant mapping'));
      return;
    }

    const layout = await layoutRepo.findOne({ where: { plantId: entry.plantId, isActive: true }, order: { updatedAt: 'DESC' } });

    const departments = await departmentRepo.find({ where: { plantId: entry.plantId, isActive: true }, order: { name: 'ASC' } });
    const modules = await moduleRepo.find({ where: { plantId: entry.plantId, isActive: true }, order: { name: 'ASC' } });

    const fallback = buildDefaultLayoutFromHierarchy({ departments, modules });
    const parsed = layout ? parseLayoutData(layout.mapData ?? null) : { nodes: fallback.nodes, edges: fallback.edges };

    const nodes = parsed.nodes.length > 0 ? parsed.nodes : fallback.nodes;
    const edges = parsed.edges.length > 0 ? parsed.edges : fallback.edges;

    const sourceNodeId =
      query.fromNodeId ??
      normalizeString(entry.currentLocationNodeId) ??
      nodes.find((node) => ['ENTRANCE', 'GATE', 'MAIN_GATE'].includes(node.nodeType.toUpperCase()))?.id ??
      nodes[0]?.id;

    const preferredDestinationNode =
      query.toNodeId ??
      nodes.find((node) => node.nodeType.toUpperCase() === 'MODULE' && entry.moduleId && node.refId === entry.moduleId)?.id ??
      nodes.find((node) => node.nodeType.toUpperCase() === 'DEPARTMENT' && entry.departmentId && node.refId === entry.departmentId)?.id;

    const destinationNodeId = preferredDestinationNode ?? nodes[nodes.length - 1]?.id;

    if (!sourceNodeId || !destinationNodeId) {
      res.status(400).json(fail('Layout does not have enough nodes to compute route'));
      return;
    }

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    const pathNodeIds = shortestPath(nodes, edges, sourceNodeId, destinationNodeId);
    const resolvedNodeIds = pathNodeIds.length > 0 ? pathNodeIds : [sourceNodeId, destinationNodeId];
    const pathNodes = resolvedNodeIds.map((nodeId) => nodeMap.get(nodeId)).filter((node): node is LayoutNode => Boolean(node));

    const instructions = pathNodes.slice(1).map((node, index) => {
      const previous = pathNodes[index];
      return `Move from ${previous.label} to ${node.label}`;
    });

    res.json(
      ok(
        {
          gateEntryId: entry.id,
          approvalStatus: entry.approvalStatus,
          sourceNode: nodeMap.get(sourceNodeId) ?? null,
          destinationNode: nodeMap.get(destinationNodeId) ?? null,
          pathNodes,
          instructions,
          svgMarkup: layout?.svgMarkup ?? fallback.svgMarkup,
          mapData: {
            nodes,
            edges,
          },
        },
        'Visitor navigation route generated',
      ),
    );
  } catch (error) {
    next(error);
  }
});

visitorExperienceRouter.get('/gate-dashboard/visitor-insights', requirePermission('GATES', 'READ'), async (req, res, next) => {
  try {
    const requestedPlantId = optionalUuid.parse(req.query.plantId);
    const resolvedPlantId = resolveScopedPlantId(req.auth!, requestedPlantId ?? null);
    ensurePlantAccess(req, resolvedPlantId);

    const repo = AppDataSource.getRepository(GateEntryEntity);
    const userRepo = AppDataSource.getRepository(UserEntity);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const baseQb = repo
      .createQueryBuilder('entry')
      .where(new Brackets((where) => {
        where.where('entry.approval_status <> :notRequired', { notRequired: 'NOT_REQUIRED' });
        where.orWhere('entry.visitor_type LIKE :visitorType', { visitorType: 'VISITOR%' });
      }));

    if (resolvedPlantId) {
      baseQb.andWhere('entry.plant_id = :plantId', { plantId: resolvedPlantId });
    } else if (!req.auth?.accessAllPlants) {
      const plantIds = req.auth?.plantIds ?? [];
      if (plantIds.length === 0) {
        res.json(
          ok(
            {
              pendingApprovals: 0,
              approvedToday: 0,
              rejectedToday: 0,
              activeVisitors: 0,
              navigationEnabled: 0,
              requestsToday: 0,
              liveTracked: 0,
              visitorsPerEmployee: [],
            },
            'Visitor insights fetched',
          ),
        );
        return;
      }
      baseQb.andWhere('entry.plant_id IN (:...plantIds)', { plantIds });
    }

    const [
      pendingApprovals,
      approvedToday,
      rejectedToday,
      activeVisitors,
      navigationEnabled,
      requestsToday,
      liveTracked,
      perEmployeeRaw,
    ] = await Promise.all([
      baseQb.clone().andWhere('entry.approval_status = :status', { status: 'PENDING' }).getCount(),
      baseQb
        .clone()
        .andWhere('entry.approval_status = :status', { status: 'APPROVED' })
        .andWhere('entry.approval_responded_at >= :dayStart', { dayStart })
        .getCount(),
      baseQb
        .clone()
        .andWhere('entry.approval_status = :status', { status: 'REJECTED' })
        .andWhere('entry.approval_responded_at >= :dayStart', { dayStart })
        .getCount(),
      baseQb.clone().andWhere('entry.status = :status', { status: 'IN' }).getCount(),
      baseQb.clone().andWhere('entry.navigation_enabled = :enabled', { enabled: true }).getCount(),
      baseQb.clone().andWhere('entry.created_at >= :dayStart', { dayStart }).getCount(),
      baseQb.clone().andWhere('entry.current_location_node_id IS NOT NULL').getCount(),
      baseQb
        .clone()
        .select('entry.person_to_meet_user_id', 'userId')
        .addSelect('COUNT(1)', 'total')
        .andWhere('entry.person_to_meet_user_id IS NOT NULL')
        .groupBy('entry.person_to_meet_user_id')
        .orderBy('COUNT(1)', 'DESC')
        .limit(10)
        .getRawMany<{ userId: string; total: string }>(),
    ]);

    const employeeIds = perEmployeeRaw.map((row) => row.userId).filter(Boolean);
    const employees = employeeIds.length > 0 ? await userRepo.find({ where: { id: In(employeeIds) } }) : [];
    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

    const visitorsPerEmployee = perEmployeeRaw.map((row) => ({
      userId: row.userId,
      employeeName: employeeMap.get(row.userId)?.fullName ?? employeeMap.get(row.userId)?.email ?? 'Unknown Employee',
      total: Number(row.total),
    }));

    res.json(
      ok(
        {
          pendingApprovals,
          approvedToday,
          rejectedToday,
          activeVisitors,
          navigationEnabled,
          requestsToday,
          liveTracked,
          visitorsPerEmployee,
        },
        'Visitor insights fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});
