// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import {
  AmcContractEntity,
  AmcContractMachineEntity,
  AmcServiceReportEntity,
  AmcVisitScheduleEntity,
  AssetEntity,
  UserEntity,
  VendorEntity,
  VendorUserMappingEntity,
  WorkOrderEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission, requireRole } from '../../middlewares/permissions';
import { fail, ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { badRequest } from '../../utils/httpError';
import { buildPagination, parseListQuery } from '../../utils/pagination';
import { resolvePlantFilter, resolveScopedPlantId } from '../../utils/plantScope';
import {
  calculateSlaFromWorkOrder,
  normalizeAmcMachineGroups,
  normalizeAmcNotificationSettings,
  ensureVisitServiceTask,
  findActiveAmcContractForAsset,
  generateAmcContractNumber,
  resolveVendorIdsForUser,
  sendAmcNotification,
  sendMail,
  syncContractSchedules,
  todayDateString,
  updateVisitStatusFromReports,
} from './amc.helpers';
import { createAmcSchema, serviceReportSchema, updateAmcSchema, verifyServiceReportSchema } from './amc.validators';

const idParamSchema = z.object({ id: z.string().uuid() });
const assetSummaryParamSchema = z.object({ assetId: z.string().uuid() });
const notifySchema = z
  .object({
    to: z.array(z.string().email()).min(1).optional(),
    subject: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
  })
  .default({});

function isVendorUser(roles: string[]) {
  return roles.some((role) => role.toUpperCase() === 'VENDOR');
}

function isInternalVerifier(roles: string[]) {
  return roles.some((role) =>
    [
      'SUPERADMIN',
      'ADMIN',
      'PLANT_ADMIN',
      'MAINTENANCE_MANAGER',
      'MECHANICAL_INCHARGE',
      'ELECTRICAL_INCHARGE',
      'UTILITY_INCHARGE',
      'TOOLCHANGE_INCHARGE',
      'CALIBRATION_INCHARGE',
    ].includes(role.toUpperCase()),
  );
}

function toNumber(value: string | null | undefined) {
  return value == null ? null : Number(value);
}

function dedupeIds(values: string[]) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0)));
}

function sanitizeMachineGroups(input: AmcContractEntity['machineGroups'], machineIds: string[]) {
  const allowedMachineIds = new Set(machineIds);
  return normalizeAmcMachineGroups(input)
    .map((group) => ({
      ...group,
      moduleIds: dedupeIds(group.moduleIds),
      assetIds: dedupeIds(group.assetIds).filter((assetId) => allowedMachineIds.has(assetId)),
    }))
    .filter((group) => group.assetIds.length > 0 || group.moduleIds.length > 0);
}

async function loadContractMachineIds(contractId: string) {
  const machineRepo = AppDataSource.getRepository(AmcContractMachineEntity);
  const rows = await machineRepo.find({ where: { contractId } });
  return dedupeIds(rows.map((row) => row.assetId));
}

async function resolveVendorScope(auth: NonNullable<Express.Request['auth']>) {
  if (!isVendorUser(auth.roles)) {
    return null;
  }
  const userRepo = AppDataSource.getRepository(UserEntity);
  const user = await userRepo.findOneBy({ id: auth.userId });
  return resolveVendorIdsForUser(auth.userId, user?.email ?? null);
}

async function serializeContracts(contracts: AmcContractEntity[]) {
  const contractIds = contracts.map((contract) => contract.id);
  const machineRepo = AppDataSource.getRepository(AmcContractMachineEntity);
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const vendorUserRepo = AppDataSource.getRepository(VendorUserMappingEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);

  const [machines, vendorUsers, nextVisits] = await Promise.all([
    contractIds.length > 0 ? machineRepo.find({ where: { contractId: In(contractIds) } }) : [],
    contracts.length > 0 ? vendorUserRepo.find({ where: { vendorId: In(Array.from(new Set(contracts.map((row) => row.vendorId)))) } }) : [],
    contractIds.length > 0
      ? visitRepo
          .createQueryBuilder('visit')
          .where('visit.contract_id IN (:...contractIds)', { contractIds })
          .andWhere('visit.visit_date >= :today', { today: todayDateString() })
          .orderBy('visit.visitDate', 'ASC')
          .getMany()
      : [],
  ]);

  const assetIds = Array.from(new Set(machines.map((row) => row.assetId)));
  const vendorUserIds = Array.from(new Set(vendorUsers.map((row) => row.userId)));
  const [assets, users] = await Promise.all([
    assetIds.length > 0 ? assetRepo.find({ where: { id: In(assetIds) } }) : [],
    vendorUserIds.length > 0 ? userRepo.find({ where: { id: In(vendorUserIds) } }) : [],
  ]);

  const assetsById = new Map(assets.map((row) => [row.id, row]));
  const usersById = new Map(users.map((row) => [row.id, row]));
  const machineMap = new Map<string, AssetEntity[]>();
  machines.forEach((row) => {
    const list = machineMap.get(row.contractId) ?? [];
    const asset = assetsById.get(row.assetId);
    if (asset) {
      list.push(asset);
      machineMap.set(row.contractId, list);
    }
  });

  const vendorUserMap = new Map<string, Array<{ id: string; fullName: string; email: string }>>();
  vendorUsers.forEach((row) => {
    const list = vendorUserMap.get(row.vendorId) ?? [];
    const user = usersById.get(row.userId);
    if (user) {
      list.push({ id: user.id, fullName: user.fullName, email: user.email });
      vendorUserMap.set(row.vendorId, list);
    }
  });

  const nextVisitMap = new Map<string, string>();
  nextVisits.forEach((visit) => {
    if (!nextVisitMap.has(visit.contractId)) {
      nextVisitMap.set(visit.contractId, visit.visitDate);
    }
  });

  return contracts.map((contract) => ({
    id: contract.id,
    contractNumber: contract.contractNumber,
    contractName: contract.contractName ?? contract.contractNumber,
    vendorId: contract.vendorId,
    plantId: contract.plantId,
    contractType: contract.contractType,
    startDate: contract.startDate,
    endDate: contract.endDate,
    visitFrequency: contract.visitFrequency,
    responseTimeSla: contract.responseTimeSla,
    resolutionTimeSla: contract.resolutionTimeSla,
    contractValue: toNumber(contract.contractValue ?? contract.amount),
    amount: toNumber(contract.amount ?? contract.contractValue),
    status: contract.status,
    terms: contract.terms,
    machineGroups: normalizeAmcMachineGroups(contract.machineGroups),
    notificationSettings: normalizeAmcNotificationSettings(contract.notificationSettings),
    assetId: contract.assetId,
    asset: contract.asset ? { id: contract.asset.id, code: contract.asset.code, name: contract.asset.name } : null,
    vendor: contract.vendor ? { id: contract.vendor.id, code: contract.vendor.code, name: contract.vendor.name, email: contract.vendor.email } : null,
    plant: contract.plant ? { id: contract.plant.id, plantCode: contract.plant.plantCode, plantName: contract.plant.plantName } : null,
    machineIds: (machineMap.get(contract.id) ?? []).map((asset) => asset.id),
    machines: (machineMap.get(contract.id) ?? []).map((asset) => ({
      id: asset.id,
      code: asset.code,
      name: asset.name,
      status: asset.status,
      criticality: asset.criticality,
    })),
    vendorUserIds: (vendorUserMap.get(contract.vendorId) ?? []).map((user) => user.id),
    vendorUsers: vendorUserMap.get(contract.vendorId) ?? [],
    nextVisitDate: nextVisitMap.get(contract.id) ?? null,
  }));
}

async function serializeVisits(visits: AmcVisitScheduleEntity[]) {
  const contractRepo = AppDataSource.getRepository(AmcContractEntity);
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const vendorRepo = AppDataSource.getRepository(VendorEntity);
  const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
  const reportRepo = AppDataSource.getRepository(AmcServiceReportEntity);

  const contractIds = Array.from(new Set(visits.map((row) => row.contractId)));
  const assetIds = Array.from(new Set(visits.map((row) => row.assetId)));
  const vendorIds = Array.from(new Set(visits.map((row) => row.vendorId)));
  const workOrderIds = Array.from(new Set(visits.map((row) => row.serviceTaskId).filter((value): value is string => Boolean(value))));

  const [contracts, assets, vendors, workOrders, reports] = await Promise.all([
    contractIds.length > 0 ? contractRepo.find({ where: { id: In(contractIds) } }) : [],
    assetIds.length > 0 ? assetRepo.find({ where: { id: In(assetIds) } }) : [],
    vendorIds.length > 0 ? vendorRepo.find({ where: { id: In(vendorIds) } }) : [],
    workOrderIds.length > 0 ? workOrderRepo.find({ where: { id: In(workOrderIds) } }) : [],
    visits.length > 0 ? reportRepo.find({ where: { visitScheduleId: In(visits.map((row) => row.id)) }, order: { createdAt: 'DESC' } }) : [],
  ]);

  const contractMap = new Map(contracts.map((row) => [row.id, row]));
  const assetMap = new Map(assets.map((row) => [row.id, row]));
  const vendorMap = new Map(vendors.map((row) => [row.id, row]));
  const workOrderMap = new Map(workOrders.map((row) => [row.id, row]));
  const latestReportMap = new Map<string, AmcServiceReportEntity>();
  reports.forEach((row) => {
    if (row.visitScheduleId && !latestReportMap.has(row.visitScheduleId)) {
      latestReportMap.set(row.visitScheduleId, row);
    }
  });

  return visits.map((visit) => ({
    id: visit.id,
    contractId: visit.contractId,
    assetId: visit.assetId,
    vendorId: visit.vendorId,
    visitDate: visit.visitDate,
    status: visit.status,
    serviceTaskId: visit.serviceTaskId,
    notificationSentAt: visit.notificationSentAt?.toISOString() ?? null,
    contractName: contractMap.get(visit.contractId)?.contractName ?? contractMap.get(visit.contractId)?.contractNumber ?? '-',
    contractNumber: contractMap.get(visit.contractId)?.contractNumber ?? '-',
    assetName: assetMap.get(visit.assetId)?.name ?? '-',
    assetCode: assetMap.get(visit.assetId)?.code ?? '-',
    vendorName: vendorMap.get(visit.vendorId)?.name ?? '-',
    workOrder: visit.serviceTaskId && workOrderMap.has(visit.serviceTaskId)
      ? {
          id: visit.serviceTaskId,
          woNumber: workOrderMap.get(visit.serviceTaskId)!.woNumber,
          status: workOrderMap.get(visit.serviceTaskId)!.status,
        }
      : null,
    latestReport: latestReportMap.get(visit.id)
      ? {
          id: latestReportMap.get(visit.id)!.id,
          serviceDate: latestReportMap.get(visit.id)!.serviceDate,
          verificationStatus: latestReportMap.get(visit.id)!.verificationStatus,
        }
      : null,
  }));
}

async function serializeReports(reports: AmcServiceReportEntity[]) {
  const contractRepo = AppDataSource.getRepository(AmcContractEntity);
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const vendorRepo = AppDataSource.getRepository(VendorEntity);
  const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
  const userRepo = AppDataSource.getRepository(UserEntity);
  const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);
  const contractIds = Array.from(new Set(reports.map((row) => row.contractId)));
  const assetIds = Array.from(new Set(reports.map((row) => row.assetId)));
  const vendorIds = Array.from(new Set(reports.map((row) => row.vendorId)));
  const workOrderIds = Array.from(new Set(reports.map((row) => row.workOrderId).filter((value): value is string => Boolean(value))));
  const verifiedByIds = Array.from(new Set(reports.map((row) => row.verifiedBy).filter((value): value is string => Boolean(value))));
  const visitIds = Array.from(new Set(reports.map((row) => row.visitScheduleId).filter((value): value is string => Boolean(value))));

  const [contracts, assets, vendors, workOrders, users, visits] = await Promise.all([
    contractIds.length > 0 ? contractRepo.find({ where: { id: In(contractIds) } }) : [],
    assetIds.length > 0 ? assetRepo.find({ where: { id: In(assetIds) } }) : [],
    vendorIds.length > 0 ? vendorRepo.find({ where: { id: In(vendorIds) } }) : [],
    workOrderIds.length > 0 ? workOrderRepo.find({ where: { id: In(workOrderIds) } }) : [],
    verifiedByIds.length > 0 ? userRepo.find({ where: { id: In(verifiedByIds) } }) : [],
    visitIds.length > 0 ? visitRepo.find({ where: { id: In(visitIds) } }) : [],
  ]);

  const contractMap = new Map(contracts.map((row) => [row.id, row]));
  const assetMap = new Map(assets.map((row) => [row.id, row]));
  const vendorMap = new Map(vendors.map((row) => [row.id, row]));
  const workOrderMap = new Map(workOrders.map((row) => [row.id, row]));
  const userMap = new Map(users.map((row) => [row.id, row]));
  const visitMap = new Map(visits.map((row) => [row.id, row]));

  return reports.map((report) => ({
    id: report.id,
    visitScheduleId: report.visitScheduleId,
    contractId: report.contractId,
    assetId: report.assetId,
    vendorId: report.vendorId,
    workOrderId: report.workOrderId,
    serviceDate: report.serviceDate,
    workDone: report.workDone,
    partsReplaced: report.partsReplaced,
    observations: report.observations,
    recommendations: report.recommendations,
    nextServiceDate: report.nextServiceDate,
    attachments: report.attachments ?? [],
    sourceType: report.sourceType,
    verificationStatus: report.verificationStatus,
    verificationRemarks: report.verificationRemarks,
    verifiedAt: report.verifiedAt?.toISOString() ?? null,
    responseTimeMinutes: report.responseTimeMinutes,
    resolutionTimeMinutes: report.resolutionTimeMinutes,
    contractName: contractMap.get(report.contractId)?.contractName ?? contractMap.get(report.contractId)?.contractNumber ?? '-',
    assetName: assetMap.get(report.assetId)?.name ?? '-',
    assetCode: assetMap.get(report.assetId)?.code ?? '-',
    vendorName: vendorMap.get(report.vendorId)?.name ?? '-',
    visitDate: report.visitScheduleId ? visitMap.get(report.visitScheduleId)?.visitDate ?? null : null,
    workOrder: report.workOrderId && workOrderMap.has(report.workOrderId)
      ? {
          id: report.workOrderId,
          woNumber: workOrderMap.get(report.workOrderId)!.woNumber,
          status: workOrderMap.get(report.workOrderId)!.status,
        }
      : null,
    verifiedByUser: report.verifiedBy && userMap.has(report.verifiedBy)
      ? {
          id: report.verifiedBy,
          fullName: userMap.get(report.verifiedBy)!.fullName,
          email: userMap.get(report.verifiedBy)!.email,
        }
      : null,
  }));
}

async function loadContractOrFail(id: string) {
  const contractRepo = AppDataSource.getRepository(AmcContractEntity);
  const contract = await contractRepo.findOne({
    where: { id },
    relations: { vendor: true, plant: true, asset: true },
  });
  if (!contract) {
    badRequest('AMC contract not found');
  }
  return contract;
}

async function validateContractAssets(assetIds: string[], plantId: string | null) {
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  const assets = await assetRepo.find({ where: { id: In(assetIds), isActive: true } });
  if (assets.length !== Array.from(new Set(assetIds)).length) {
    badRequest('One or more selected machines are invalid');
  }
  if (plantId && assets.some((asset) => asset.plantId !== plantId)) {
    badRequest('Selected machines must belong to the same plant as the contract');
  }
  return assets;
}

export const amcRouter = Router();
amcRouter.use(requireAuth);

amcRouter.get('/amc/dashboard', requirePermission('AMC', 'READ'), async (req, res, next) => {
  try {
    const contractRepo = AppDataSource.getRepository(AmcContractEntity);
    const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);
    const reportRepo = AppDataSource.getRepository(AmcServiceReportEntity);
    const assetRepo = AppDataSource.getRepository(AssetEntity);

    const query = parseListQuery(req.query as Record<string, unknown>);
    const plantIds = resolvePlantFilter(req.auth!, query.plantId);
    const vendorIds = await resolveVendorScope(req.auth!);

    const contractQb = contractRepo.createQueryBuilder('contract');
    if (plantIds) {
      if (plantIds.length === 0) {
        res.json(ok({
          amcCompliance: 0,
          pendingVisits: 0,
          missedVisits: 0,
          vendorResponseTimeHours: 0,
          machineAmcCoverage: 0,
          activeContracts: 0,
        }));
        return;
      }
      contractQb.andWhere('contract.plant_id IN (:...plantIds)', { plantIds });
    }
    if (vendorIds) {
      contractQb.andWhere('contract.vendor_id IN (:...vendorIds)', { vendorIds: vendorIds.length > 0 ? vendorIds : ['00000000-0000-0000-0000-000000000000'] });
    }
    const contracts = await contractQb.getMany();
    const contractIds = contracts.map((row) => row.id);
    const machineRows = contractIds.length > 0
      ? await AppDataSource.getRepository(AmcContractMachineEntity).find({ where: { contractId: In(contractIds) } })
      : [];

    const visits = contractIds.length > 0 ? await visitRepo.find({ where: { contractId: In(contractIds) } }) : [];
    const reports = contractIds.length > 0 ? await reportRepo.find({ where: { contractId: In(contractIds) } }) : [];
    const assetQb = assetRepo.createQueryBuilder('asset').where('asset.is_active = :active', { active: true });
    if (plantIds) {
      assetQb.andWhere('asset.plant_id IN (:...plantIds)', { plantIds });
    }
    const totalAssets = await assetQb.getCount();

    const today = todayDateString();
    const dueVisits = visits.filter((visit) => visit.visitDate <= today && visit.status !== 'CANCELLED');
    const completedVisits = dueVisits.filter((visit) => visit.status === 'COMPLETED');
    const pendingVisits = dueVisits.filter((visit) => !['COMPLETED', 'CANCELLED'].includes(visit.status)).length;
    const missedVisits = dueVisits.filter((visit) => visit.visitDate < today && !['COMPLETED', 'CANCELLED'].includes(visit.status)).length;
    const coverageAssetIds = new Set(machineRows.map((row) => row.assetId));
    const avgResponseMinutes = reports.length > 0
      ? reports.reduce((sum, row) => sum + (row.responseTimeMinutes ?? 0), 0) / reports.length
      : 0;

    res.json(
      ok({
        amcCompliance: dueVisits.length > 0 ? Number(((completedVisits.length / dueVisits.length) * 100).toFixed(1)) : 0,
        pendingVisits,
        missedVisits,
        vendorResponseTimeHours: Number((avgResponseMinutes / 60).toFixed(1)),
        machineAmcCoverage: totalAssets > 0 ? Number(((coverageAssetIds.size / totalAssets) * 100).toFixed(1)) : 0,
        activeContracts: contracts.filter((row) => ['ACTIVE', 'RENEWAL_DUE'].includes(row.status)).length,
      }),
    );
  } catch (error) {
    next(error);
  }
});

amcRouter.get('/amc/portal', requirePermission('AMC', 'READ'), async (req, res, next) => {
  try {
    const vendorIds = await resolveVendorScope(req.auth!);
    if (!vendorIds || vendorIds.length === 0) {
      res.json(ok({
        assignedMachines: [],
        upcomingVisits: [],
        breakdownRequests: [],
        serviceHistory: [],
      }));
      return;
    }

    const contractRepo = AppDataSource.getRepository(AmcContractEntity);
    const machineRepo = AppDataSource.getRepository(AmcContractMachineEntity);
    const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);
    const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
    const reportRepo = AppDataSource.getRepository(AmcServiceReportEntity);
    const assetRepo = AppDataSource.getRepository(AssetEntity);

    const contracts = await contractRepo.find({ where: { vendorId: In(vendorIds) } });
    const contractIds = contracts.map((row) => row.id);
    const machineRows = contractIds.length > 0 ? await machineRepo.find({ where: { contractId: In(contractIds) } }) : [];
    const assetIds = Array.from(new Set(machineRows.map((row) => row.assetId)));
    const assets = assetIds.length > 0 ? await assetRepo.find({ where: { id: In(assetIds) } }) : [];
    const assetMap = new Map(assets.map((row) => [row.id, row]));

    const upcomingVisits = await serializeVisits(
      await visitRepo
        .createQueryBuilder('visit')
        .where('visit.vendor_id IN (:...vendorIds)', { vendorIds })
        .andWhere('visit.visit_date >= :today', { today: todayDateString() })
        .orderBy('visit.visitDate', 'ASC')
        .limit(30)
        .getMany(),
    );

    const breakdownRequests = await workOrderRepo
      .createQueryBuilder('wo')
      .where('wo.vendor_id IN (:...vendorIds)', { vendorIds })
      .andWhere('UPPER(wo.wo_type) = :woType', { woType: 'BREAKDOWN' })
      .orderBy('wo.createdAt', 'DESC')
      .limit(30)
      .getMany();

    const serviceHistory = await serializeReports(
      await reportRepo
        .createQueryBuilder('report')
        .where('report.vendor_id IN (:...vendorIds)', { vendorIds })
        .orderBy('report.serviceDate', 'DESC')
        .limit(50)
        .getMany(),
    );

    res.json(
      ok({
        assignedMachines: machineRows.map((row) => {
          const asset = assetMap.get(row.assetId);
          return {
            id: row.assetId,
            code: asset?.code ?? '-',
            name: asset?.name ?? '-',
            status: asset?.status ?? '-',
            criticality: asset?.criticality ?? '-',
          };
        }),
        upcomingVisits,
        breakdownRequests: breakdownRequests.map((row) => ({
          id: row.id,
          woNumber: row.woNumber,
          assetId: row.assetId,
          status: row.status,
          problemDescription: row.problemDescription,
          createdAt: row.createdAt?.toISOString?.() ?? null,
        })),
        serviceHistory,
      }),
    );
  } catch (error) {
    next(error);
  }
});

amcRouter.get('/amc/visits', requirePermission('AMC', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);
    const qb = visitRepo.createQueryBuilder('visit');
    const plantIds = resolvePlantFilter(req.auth!, query.plantId);
    const vendorIds = await resolveVendorScope(req.auth!);
    const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : undefined;

    if (plantIds) {
      if (plantIds.length === 0) {
        res.json(ok([], 'AMC visits fetched', buildPagination(query.page, query.limit, 0)));
        return;
      }
      qb.innerJoin(AmcContractEntity, 'contract', 'contract.id = visit.contract_id');
      qb.andWhere('contract.plant_id IN (:...plantIds)', { plantIds });
    }
    if (vendorIds) {
      qb.andWhere('visit.vendor_id IN (:...vendorIds)', { vendorIds: vendorIds.length > 0 ? vendorIds : ['00000000-0000-0000-0000-000000000000'] });
    }
    if (status) {
      qb.andWhere('UPPER(visit.status) = :status', { status });
    }
    if (typeof req.query.contractId === 'string') {
      qb.andWhere('visit.contract_id = :contractId', { contractId: req.query.contractId });
    }
    if (typeof req.query.assetId === 'string') {
      qb.andWhere('visit.asset_id = :assetId', { assetId: req.query.assetId });
    }

    qb.orderBy('visit.visitDate', 'ASC').skip((query.page - 1) * query.limit).take(query.limit);
    const [visits, total] = await qb.getManyAndCount();
    res.json(ok(await serializeVisits(visits), 'AMC visits fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

amcRouter.get('/amc/service-reports', requirePermission('AMC', 'READ'), async (req, res, next) => {
  try {
    const query = parseListQuery(req.query as Record<string, unknown>);
    const reportRepo = AppDataSource.getRepository(AmcServiceReportEntity);
    const plantIds = resolvePlantFilter(req.auth!, query.plantId);
    const vendorIds = await resolveVendorScope(req.auth!);
    const qb = reportRepo.createQueryBuilder('report');

    if (plantIds) {
      if (plantIds.length === 0) {
        res.json(ok([], 'AMC service reports fetched', buildPagination(query.page, query.limit, 0)));
        return;
      }
      qb.innerJoin(AmcContractEntity, 'contract', 'contract.id = report.contract_id');
      qb.andWhere('contract.plant_id IN (:...plantIds)', { plantIds });
    }
    if (vendorIds) {
      qb.andWhere('report.vendor_id IN (:...vendorIds)', { vendorIds: vendorIds.length > 0 ? vendorIds : ['00000000-0000-0000-0000-000000000000'] });
    }
    if (typeof req.query.verificationStatus === 'string') {
      qb.andWhere('UPPER(report.verification_status) = :verificationStatus', { verificationStatus: String(req.query.verificationStatus).toUpperCase() });
    }
    qb.orderBy('report.serviceDate', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [reports, total] = await qb.getManyAndCount();
    res.json(ok(await serializeReports(reports), 'AMC service reports fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

amcRouter.post('/amc/service-reports', requireRole(['VENDOR', 'SUPERADMIN', 'ADMIN', 'PLANT_ADMIN', 'MAINTENANCE_MANAGER']), requirePermission('AMC', 'CREATE'), async (req, res, next) => {
  try {
    const body = serviceReportSchema.parse(req.body);
    const vendorScopedIds = await resolveVendorScope(req.auth!);

    const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);
    const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);
    const reportRepo = AppDataSource.getRepository(AmcServiceReportEntity);

    let contractId = '';
    let assetId = '';
    let vendorId = '';
    let workOrder: WorkOrderEntity | null = null;

    if (body.visitScheduleId) {
      const visit = await visitRepo.findOneBy({ id: body.visitScheduleId });
      if (!visit) {
        res.status(404).json(fail('AMC visit schedule not found'));
        return;
      }
      const contract = await loadContractOrFail(visit.contractId);
      ensurePlantAccess(req, contract.plantId);
      if (vendorScopedIds && !vendorScopedIds.includes(visit.vendorId)) {
        res.status(403).json(fail('Vendor access denied'));
        return;
      }
      contractId = visit.contractId;
      assetId = visit.assetId;
      vendorId = visit.vendorId;
      workOrder = visit.serviceTaskId ? await workOrderRepo.findOneBy({ id: visit.serviceTaskId }) : null;
    } else if (body.workOrderId) {
      const linkedWorkOrder = await workOrderRepo.findOneBy({ id: body.workOrderId });
      if (!linkedWorkOrder) {
        res.status(404).json(fail('Work order not found'));
        return;
      }
      const contract = await findActiveAmcContractForAsset(linkedWorkOrder.assetId);
      if (!contract) {
        res.status(400).json(fail('Work order asset is not covered by an active AMC'));
        return;
      }
      ensurePlantAccess(req, contract.plantId);
      if (vendorScopedIds && !vendorScopedIds.includes(contract.vendorId)) {
        res.status(403).json(fail('Vendor access denied'));
        return;
      }
      contractId = contract.id;
      assetId = linkedWorkOrder.assetId;
      vendorId = contract.vendorId;
      workOrder = linkedWorkOrder;
    }

    const sla = calculateSlaFromWorkOrder(workOrder, body.serviceDate);
    const report = reportRepo.create({
      visitScheduleId: body.visitScheduleId ?? null,
      contractId,
      assetId,
      vendorId,
      workOrderId: body.workOrderId ?? workOrder?.id ?? null,
      serviceDate: body.serviceDate,
      workDone: body.workDone,
      partsReplaced: body.partsReplaced ?? null,
      observations: body.observations ?? null,
      recommendations: body.recommendations ?? null,
      nextServiceDate: body.nextServiceDate ?? null,
      attachments: body.attachments ?? [],
      sourceType: body.visitScheduleId ? 'VISIT' : 'BREAKDOWN',
      verificationStatus: 'SUBMITTED',
      verificationRemarks: null,
      verifiedBy: null,
      verifiedAt: null,
      responseTimeMinutes: sla.responseTimeMinutes,
      resolutionTimeMinutes: sla.resolutionTimeMinutes,
    });
    await reportRepo.save(report);

    if (body.visitScheduleId) {
      await AppDataSource.getRepository(AmcVisitScheduleEntity).update(body.visitScheduleId, { status: 'REPORTED' });
    }

    const contract = await loadContractOrFail(contractId);
    const notificationSettings = normalizeAmcNotificationSettings(contract.notificationSettings);
    if (notificationSettings.notifyOnServiceReportSubmitted) {
      await sendAmcNotification({
        vendorId,
        plantId: contract.plantId,
        title: 'AMC Service Report Submitted',
        message: `Service report was submitted for contract ${contract.contractName ?? contract.contractNumber}.`,
        emailSubject: '[CMMS] AMC service report submitted',
        emailBody: `Service report submitted on ${body.serviceDate}\nContract: ${contract.contractName ?? contract.contractNumber}`,
        link: '/amc',
        woId: workOrder?.id ?? null,
        preferences: notificationSettings,
      });
    }

    res.status(201).json(ok((await serializeReports([report]))[0], 'AMC service report submitted'));
  } catch (error) {
    next(error);
  }
});

amcRouter.patch('/amc/service-reports/:id/verify', requireAuth, async (req, res, next) => {
  try {
    if (!isInternalVerifier(req.auth!.roles)) {
      res.status(403).json(fail('Verification access denied'));
      return;
    }

    const params = idParamSchema.parse(req.params);
    const body = verifyServiceReportSchema.parse(req.body);
    const reportRepo = AppDataSource.getRepository(AmcServiceReportEntity);
    const report = await reportRepo.findOneBy({ id: params.id });
    if (!report) {
      res.status(404).json(fail('AMC service report not found'));
      return;
    }
    const contract = await loadContractOrFail(report.contractId);
    ensurePlantAccess(req, contract.plantId);

    report.verificationStatus = body.verificationStatus;
    report.verificationRemarks = body.verificationRemarks ?? null;
    report.verifiedBy = req.auth!.userId;
    report.verifiedAt = new Date();
    await reportRepo.save(report);

    if (report.visitScheduleId) {
      await AppDataSource.transaction(async (manager) => {
        await updateVisitStatusFromReports(manager, report.visitScheduleId!);
      });
    }

    const notificationSettings = normalizeAmcNotificationSettings(contract.notificationSettings);
    if (notificationSettings.notifyOnServiceReportVerified) {
      await sendAmcNotification({
        vendorId: contract.vendorId,
        plantId: contract.plantId,
        title: `AMC Service Report ${body.verificationStatus === 'VERIFIED' ? 'Verified' : 'Rejected'}`,
        message: `Service report for contract ${contract.contractName ?? contract.contractNumber} was ${body.verificationStatus.toLowerCase()}.`,
        emailSubject: `[CMMS] AMC service report ${body.verificationStatus.toLowerCase()}`,
        emailBody: [
          `Contract: ${contract.contractName ?? contract.contractNumber}`,
          `Status: ${body.verificationStatus}`,
          `Remarks: ${body.verificationRemarks ?? '-'}`,
        ].join('\n'),
        link: '/amc',
        woId: report.workOrderId,
        preferences: notificationSettings,
      });
    }

    res.json(ok((await serializeReports([report]))[0], 'AMC service report verified'));
  } catch (error) {
    next(error);
  }
});

amcRouter.get('/amc/assets/:assetId/summary', requirePermission('ASSETS', 'READ'), async (req, res, next) => {
  try {
    const params = assetSummaryParamSchema.parse(req.params);
    const contract = await findActiveAmcContractForAsset(params.assetId);
    if (!contract) {
      res.json(ok({
        covered: false,
        contract: null,
        nextVisit: null,
        pendingBreakdowns: 0,
        recentReports: [],
      }));
      return;
    }

    ensurePlantAccess(req, contract.plantId);
    const visitRepo = AppDataSource.getRepository(AmcVisitScheduleEntity);
    const reportRepo = AppDataSource.getRepository(AmcServiceReportEntity);
    const workOrderRepo = AppDataSource.getRepository(WorkOrderEntity);

    const [nextVisit, recentReports, pendingBreakdowns] = await Promise.all([
      visitRepo
        .createQueryBuilder('visit')
        .where('visit.contract_id = :contractId', { contractId: contract.id })
        .andWhere('visit.asset_id = :assetId', { assetId: params.assetId })
        .andWhere('visit.visit_date >= :today', { today: todayDateString() })
        .orderBy('visit.visitDate', 'ASC')
        .getOne(),
      reportRepo.find({
        where: { contractId: contract.id, assetId: params.assetId },
        order: { serviceDate: 'DESC' },
        take: 5,
      }),
      workOrderRepo
        .createQueryBuilder('wo')
        .where('wo.asset_id = :assetId', { assetId: params.assetId })
        .andWhere('UPPER(wo.wo_type) = :woType', { woType: 'BREAKDOWN' })
        .andWhere('UPPER(wo.status) <> :closed', { closed: 'CLOSED' })
        .getCount(),
    ]);

    res.json(
      ok({
        covered: true,
        contract: {
          id: contract.id,
          contractNumber: contract.contractNumber,
          contractName: contract.contractName ?? contract.contractNumber,
          status: contract.status,
          vendorId: contract.vendorId,
          startDate: contract.startDate,
          endDate: contract.endDate,
          visitFrequency: contract.visitFrequency,
        },
        nextVisit: nextVisit
          ? {
              id: nextVisit.id,
              visitDate: nextVisit.visitDate,
              status: nextVisit.status,
            }
          : null,
        pendingBreakdowns,
        recentReports: (await serializeReports(recentReports)).slice(0, 5),
      }),
    );
  } catch (error) {
    next(error);
  }
});

amcRouter.post('/amc/visits/:id/generate-task', requirePermission('AMC', 'UPDATE'), async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const taskId = await ensureVisitServiceTask(params.id);
    res.json(ok({ serviceTaskId: taskId }, 'AMC visit service task generated'));
  } catch (error) {
    next(error);
  }
});

amcRouter.get('/amc', requirePermission('AMC', 'READ'), async (req, res, next) => {
  try {
    const contractRepo = AppDataSource.getRepository(AmcContractEntity);
    const query = parseListQuery(req.query as Record<string, unknown>);
    const plantIds = resolvePlantFilter(req.auth!, query.plantId);
    const vendorIds = await resolveVendorScope(req.auth!);
    const qb = contractRepo.createQueryBuilder('contract')
      .leftJoinAndSelect('contract.vendor', 'vendor')
      .leftJoinAndSelect('contract.plant', 'plant')
      .leftJoinAndSelect('contract.asset', 'asset');

    if (plantIds) {
      if (plantIds.length === 0) {
        res.json(ok([], 'AMC contracts fetched', buildPagination(query.page, query.limit, 0)));
        return;
      }
      qb.andWhere('contract.plant_id IN (:...plantIds)', { plantIds });
    }
    if (vendorIds) {
      qb.andWhere('contract.vendor_id IN (:...vendorIds)', { vendorIds: vendorIds.length > 0 ? vendorIds : ['00000000-0000-0000-0000-000000000000'] });
    }
    if (query.search) {
      qb.andWhere('(LOWER(contract.contract_name) LIKE :search OR LOWER(contract.contract_number) LIKE :search)', { search: `%${query.search.toLowerCase()}%` });
    }
    if (typeof req.query.status === 'string') {
      qb.andWhere('UPPER(contract.status) = :status', { status: String(req.query.status).toUpperCase() });
    }

    qb.orderBy('contract.createdAt', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [contracts, total] = await qb.getManyAndCount();
    res.json(ok(await serializeContracts(contracts), 'AMC contracts fetched', buildPagination(query.page, query.limit, total)));
  } catch (error) {
    next(error);
  }
});

amcRouter.get('/amc/:id', requirePermission('AMC', 'READ'), async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const contract = await loadContractOrFail(params.id);
    ensurePlantAccess(req, contract.plantId);
    const serialized = await serializeContracts([contract]);
    res.json(ok(serialized[0], 'AMC contract fetched'));
  } catch (error) {
    next(error);
  }
});

amcRouter.post('/amc', requirePermission('AMC', 'CREATE'), async (req, res, next) => {
  try {
    const body = createAmcSchema.parse(req.body);
    if (body.endDate < body.startDate) {
      res.status(400).json(fail('endDate must be on or after startDate'));
      return;
    }

    const plantId = resolveScopedPlantId(req.auth!, body.plantId ?? null);
    if (!plantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }
    ensurePlantAccess(req, plantId);

    const vendorRepo = AppDataSource.getRepository(VendorEntity);
    const vendor = await vendorRepo.findOneBy({ id: body.vendorId });
    if (!vendor) {
      res.status(404).json(fail('Vendor not found'));
      return;
    }

    const assets = await validateContractAssets(body.machineIds, plantId);
    const machineIds = dedupeIds(body.machineIds);
    const machineGroups = sanitizeMachineGroups(body.machineGroups, machineIds);
    const notificationSettings = normalizeAmcNotificationSettings(body.notificationSettings ?? null);

    const contract = await AppDataSource.transaction(async (manager) => {
      const contractRepo = manager.getRepository(AmcContractEntity);
      const vendorUserRepo = manager.getRepository(VendorUserMappingEntity);
      const entity = contractRepo.create({
        contractNumber: body.contractNumber?.trim() || generateAmcContractNumber(),
        contractName: body.contractName,
        assetId: assets[0].id,
        vendorId: body.vendorId,
        startDate: body.startDate,
        endDate: body.endDate,
        contractType: body.contractType,
        visitFrequency: body.visitFrequency,
        responseTimeSla: body.responseTimeSla ?? null,
        resolutionTimeSla: body.resolutionTimeSla ?? null,
        contractValue: body.contractValue == null ? null : String(body.contractValue),
        amount: body.contractValue == null ? null : String(body.contractValue),
        status: body.status,
        terms: body.terms ?? null,
        plantId,
        machineGroups,
        notificationSettings,
      });
      const saved = await contractRepo.save(entity);

      if (body.vendorUserIds) {
        await vendorUserRepo.delete({ vendorId: body.vendorId });
        if (body.vendorUserIds.length > 0) {
          await vendorUserRepo.save(
            body.vendorUserIds.map((userId) =>
              vendorUserRepo.create({
                vendorId: body.vendorId,
                userId,
              }),
            ),
          );
        }
      }

      await syncContractSchedules(manager, {
        contractId: saved.id,
        vendorId: body.vendorId,
        assetIds: machineIds,
        startDate: body.startDate,
        endDate: body.endDate,
        visitFrequency: body.visitFrequency,
        status: body.status,
      });
      return saved.id;
    });

    await audit('amc.create', {
      module: 'AMC',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'amc_contracts',
      entityId: contract,
      plantId,
      statusCode: 201,
    });

    const created = await loadContractOrFail(contract);
    res.status(201).json(ok((await serializeContracts([created]))[0], 'AMC contract created'));
  } catch (error) {
    next(error);
  }
});

amcRouter.patch('/amc/:id', requirePermission('AMC', 'UPDATE'), async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const body = updateAmcSchema.parse(req.body);
    const existing = await loadContractOrFail(params.id);
    const nextPlantId = resolveScopedPlantId(req.auth!, body.plantId === undefined ? existing.plantId : body.plantId);
    if (!nextPlantId) {
      res.status(400).json(fail('plantId is required'));
      return;
    }
    ensurePlantAccess(req, nextPlantId);

    if (body.vendorId) {
      const vendor = await AppDataSource.getRepository(VendorEntity).findOneBy({ id: body.vendorId });
      if (!vendor) {
        res.status(404).json(fail('Vendor not found'));
        return;
      }
    }

    const existingMachineIds = await loadContractMachineIds(existing.id);
    const nextMachineIds = dedupeIds(body.machineIds ?? (existingMachineIds.length > 0 ? existingMachineIds : [existing.assetId]));
    const nextStartDate = body.startDate ?? existing.startDate;
    const nextEndDate = body.endDate ?? existing.endDate;
    if (nextEndDate < nextStartDate) {
      res.status(400).json(fail('endDate must be on or after startDate'));
      return;
    }
    const assets = await validateContractAssets(nextMachineIds, nextPlantId);
    const machineGroups = body.machineGroups === undefined
      ? normalizeAmcMachineGroups(existing.machineGroups)
      : sanitizeMachineGroups(body.machineGroups, nextMachineIds);
    const notificationSettings = body.notificationSettings === undefined
      ? normalizeAmcNotificationSettings(existing.notificationSettings)
      : normalizeAmcNotificationSettings(body.notificationSettings);

    await AppDataSource.transaction(async (manager) => {
      const contractRepo = manager.getRepository(AmcContractEntity);
      const vendorUserRepo = manager.getRepository(VendorUserMappingEntity);
      const contract = await contractRepo.findOneBy({ id: params.id });
      if (!contract) {
        badRequest('AMC contract not found');
      }
      const previousVendorId = contract.vendorId;

      contract.contractNumber = body.contractNumber?.trim() || contract.contractNumber;
      contract.contractName = body.contractName ?? contract.contractName;
      contract.assetId = assets[0].id;
      contract.vendorId = body.vendorId ?? contract.vendorId;
      contract.plantId = nextPlantId;
      contract.contractType = body.contractType ?? contract.contractType;
      contract.startDate = nextStartDate;
      contract.endDate = nextEndDate;
      contract.visitFrequency = body.visitFrequency ?? contract.visitFrequency;
      contract.responseTimeSla = body.responseTimeSla === undefined ? contract.responseTimeSla : body.responseTimeSla;
      contract.resolutionTimeSla = body.resolutionTimeSla === undefined ? contract.resolutionTimeSla : body.resolutionTimeSla;
      contract.contractValue = body.contractValue === undefined ? contract.contractValue : body.contractValue == null ? null : String(body.contractValue);
      contract.amount = body.contractValue === undefined ? contract.amount : body.contractValue == null ? null : String(body.contractValue);
      contract.status = body.status ?? contract.status;
      contract.terms = body.terms === undefined ? contract.terms : body.terms;
      contract.machineGroups = machineGroups;
      contract.notificationSettings = notificationSettings;
      await contractRepo.save(contract);

      if (body.vendorUserIds) {
        await vendorUserRepo.delete({ vendorId: body.vendorId ?? previousVendorId });
        if (body.vendorUserIds.length > 0) {
          await vendorUserRepo.save(
            body.vendorUserIds.map((userId) =>
              vendorUserRepo.create({
                vendorId: contract.vendorId,
                userId,
              }),
            ),
          );
        }
      }

      await syncContractSchedules(manager, {
        contractId: contract.id,
        vendorId: contract.vendorId,
        assetIds: nextMachineIds,
        startDate: contract.startDate,
        endDate: contract.endDate,
        visitFrequency: contract.visitFrequency ?? 'MONTHLY',
        status: contract.status,
      });
    });

    await audit('amc.update', {
      module: 'AMC',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'amc_contracts',
      entityId: params.id,
      plantId: nextPlantId,
      statusCode: 200,
    });

    const updated = await loadContractOrFail(params.id);
    res.json(ok((await serializeContracts([updated]))[0], 'AMC contract updated'));
  } catch (error) {
    next(error);
  }
});

amcRouter.delete('/amc/:id', requirePermission('AMC', 'DELETE'), async (req, res, next) => {
  try {
    const params = idParamSchema.parse(req.params);
    const contractRepo = AppDataSource.getRepository(AmcContractEntity);
    const contract = await loadContractOrFail(params.id);
    ensurePlantAccess(req, contract.plantId);
    contract.status = 'CANCELLED';
    await contractRepo.save(contract);
    await audit('amc.delete', {
      module: 'AMC',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'amc_contracts',
      entityId: params.id,
      plantId: contract.plantId,
      statusCode: 200,
    });
    res.json(ok({ id: params.id, deleted: true }, 'AMC contract cancelled'));
  } catch (error) {
    next(error);
  }
});

amcRouter.post('/amc/notify-vendor', requireRole(['SUPERADMIN', 'ADMIN', 'PLANT_ADMIN', 'MAINTENANCE_MANAGER']), requirePermission('AMC', 'UPDATE'), async (req, res, next) => {
  try {
    const payload = notifySchema.parse(req.body);
    if (payload.to && payload.subject && payload.message) {
      const result = await sendMail(payload.to, payload.subject, payload.message);
      res.json(ok({ sent: result.sent }, 'Vendor notification processed'));
      return;
    }

    const contractRepo = AppDataSource.getRepository(AmcContractEntity);
    const contracts = await contractRepo.find();
    let emailsSent = 0;
    for (const contract of contracts) {
      const notificationSettings = normalizeAmcNotificationSettings(contract.notificationSettings);
      if (!notificationSettings.notifyOnRenewal) {
        continue;
      }
      const endDate = new Date(`${contract.endDate}T00:00:00.000Z`);
      const today = new Date(`${todayDateString()}T00:00:00.000Z`);
      const diffDays = Math.floor((endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      if (!notificationSettings.notifyBeforeDays.includes(diffDays)) {
        continue;
      }
      await sendAmcNotification({
        vendorId: contract.vendorId,
        plantId: contract.plantId,
        title: `AMC Renewal Alert - ${contract.contractName ?? contract.contractNumber}`,
        message: `AMC contract ${contract.contractName ?? contract.contractNumber} is due in ${diffDays} day(s).`,
        emailSubject: `[CMMS] AMC renewal alert: ${contract.contractName ?? contract.contractNumber}`,
        emailBody: `Contract ${contract.contractName ?? contract.contractNumber}\nEnd date: ${contract.endDate}`,
        link: '/masters/amc-config',
        preferences: notificationSettings,
      });
      emailsSent += 1;
    }
    res.json(ok({ emailsSent }, 'AMC vendor notification job completed'));
  } catch (error) {
    next(error);
  }
});
