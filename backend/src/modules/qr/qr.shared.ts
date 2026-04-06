import type { Request } from 'express';
import { env } from '../../config/env';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, AssetQrEntity, DepartmentEntity, MachineModuleEntity, PlantEntity } from '../../database/entities';
import { generateQrCodeId, generateQrToken } from '../../utils/qr';

export type RequestLike = Pick<Request, 'protocol' | 'get'>;

function isLoopbackHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname.trim().toLowerCase());
}

function requestBaseUrl(req: RequestLike) {
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost || req.get('host');
  if (!host) {
    return null;
  }
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = (forwardedProto || req.protocol || 'http').split(',')[0].trim();
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

export function publicFrontendBaseUrl(req: RequestLike) {
  const requestUrl = requestBaseUrl(req);
  if (requestUrl) {
    try {
      const parsedRequestUrl = new URL(requestUrl);
      if (!isLoopbackHost(parsedRequestUrl.hostname)) {
        return parsedRequestUrl.toString().replace(/\/+$/, '');
      }
    } catch {
      // Fall through to the configured URL fallback below.
    }
  }

  const configuredFrontendUrl = env.FRONTEND_URL.replace(/\/+$/, '');
  try {
    const parsed = new URL(configuredFrontendUrl);
    if (!isLoopbackHost(parsed.hostname)) {
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    // Fall back to request-derived host below.
  }

  return requestUrl || configuredFrontendUrl;
}

export function toScanLinks(
  req: RequestLike,
  token: string,
  context?: {
    assetId?: string | null;
    assetCode?: string | null;
    departmentId?: string | null;
    moduleId?: string | null;
    departmentCode?: string | null;
    moduleCode?: string | null;
  },
) {
  const frontendBase = publicFrontendBaseUrl(req);
  const resolverParams = new URLSearchParams();
  resolverParams.set('token', token);
  if (context?.assetId) resolverParams.set('assetId', context.assetId);
  if (context?.departmentId) resolverParams.set('departmentId', context.departmentId);
  if (context?.moduleId) resolverParams.set('moduleId', context.moduleId);
  if (context?.departmentCode) resolverParams.set('department', context.departmentCode);
  if (context?.moduleCode) resolverParams.set('module', context.moduleCode);

  const machineCode = context?.assetCode?.trim() ?? '';
  const publicResolverUrl = machineCode
    ? `${frontendBase}/assets/${encodeURIComponent(machineCode)}?${resolverParams.toString()}`
    : `${frontendBase}/qr/${encodeURIComponent(token)}`;

  return {
    publicResolverUrl,
    appScanUrl: `${frontendBase}/scan/${encodeURIComponent(token)}`,
    machineCardUrl: context?.assetId ? `${frontendBase}/machine/${encodeURIComponent(context.assetId)}` : `${frontendBase}/machine`,
  };
}

export async function ensureAssetQr(asset: AssetEntity) {
  const qrRepo = AppDataSource.getRepository(AssetQrEntity);
  const assetRepo = AppDataSource.getRepository(AssetEntity);
  let row = await qrRepo.findOneBy({ assetId: asset.id });
  if (!row) {
    row = qrRepo.create({
      assetId: asset.id,
      qrToken: generateQrToken(),
      rotatedAt: null,
    });
    row = await qrRepo.save(row);
  }
  if (!asset.qrCodeId) {
    asset.qrCodeId = generateQrCodeId();
    await assetRepo.save(asset);
  }
  return row;
}

export async function findQrResolutionRow(token: string) {
  return AppDataSource.createQueryBuilder()
    .select([
      'asset.id AS asset_id',
      'asset.code AS asset_code',
      'asset.name AS asset_name',
      'asset.asset_type AS asset_type',
      'asset.status AS asset_status',
      'asset.location AS asset_location',
      'asset.machine_image_url AS asset_machine_image_url',
      'asset.plant_id AS asset_plant_id',
      'asset.department_id AS asset_department_id',
      'asset.module_id AS asset_module_id',
      'asset.qr_code_id AS asset_qr_code_id',
      'plant.id AS plant_id',
      'plant.plant_code AS plant_code',
      'plant.plant_name AS plant_name',
      'department.id AS department_id',
      'department.code AS department_code',
      'department.name AS department_name',
      'module.id AS module_id',
      'module.code AS module_code',
      'module.name AS module_name',
    ])
    .from(AssetQrEntity, 'asset_qr')
    .innerJoin(AssetEntity, 'asset', 'asset.id = asset_qr.asset_id')
    .leftJoin(PlantEntity, 'plant', 'plant.id = asset.plant_id')
    .leftJoin(DepartmentEntity, 'department', 'department.id = asset.department_id')
    .leftJoin(MachineModuleEntity, 'module', 'module.id = asset.module_id')
    .where('asset_qr.qr_token = :token', { token })
    .andWhere('asset.is_active = :isActive', { isActive: true })
    .getRawOne<{
      asset_id: string;
      asset_code: string;
      asset_name: string;
      asset_type: string;
      asset_status: string | null;
      asset_location: string | null;
      asset_machine_image_url: string | null;
      asset_plant_id: string | null;
      asset_department_id: string | null;
      asset_module_id: string | null;
      asset_qr_code_id: string | null;
      plant_id: string | null;
      plant_code: string | null;
      plant_name: string | null;
      department_id: string | null;
      department_code: string | null;
      department_name: string | null;
      module_id: string | null;
      module_code: string | null;
      module_name: string | null;
    }>();
}

export async function findQrResolutionRowByMachineCode(machineCode: string) {
  return AppDataSource.createQueryBuilder()
    .select([
      'asset_qr.qr_token AS qr_token',
      'asset.id AS asset_id',
      'asset.code AS asset_code',
      'asset.name AS asset_name',
      'asset.asset_type AS asset_type',
      'asset.status AS asset_status',
      'asset.location AS asset_location',
      'asset.machine_image_url AS asset_machine_image_url',
      'asset.plant_id AS asset_plant_id',
      'asset.department_id AS asset_department_id',
      'asset.module_id AS asset_module_id',
      'asset.qr_code_id AS asset_qr_code_id',
      'plant.id AS plant_id',
      'plant.plant_code AS plant_code',
      'plant.plant_name AS plant_name',
      'department.id AS department_id',
      'department.code AS department_code',
      'department.name AS department_name',
      'module.id AS module_id',
      'module.code AS module_code',
      'module.name AS module_name',
    ])
    .from(AssetEntity, 'asset')
    .leftJoin(AssetQrEntity, 'asset_qr', 'asset_qr.asset_id = asset.id')
    .leftJoin(PlantEntity, 'plant', 'plant.id = asset.plant_id')
    .leftJoin(DepartmentEntity, 'department', 'department.id = asset.department_id')
    .leftJoin(MachineModuleEntity, 'module', 'module.id = asset.module_id')
    .where('LOWER(asset.code) = LOWER(:machineCode)', { machineCode })
    .andWhere('asset.is_active = :isActive', { isActive: true })
    .getRawOne<{
      qr_token: string | null;
      asset_id: string;
      asset_code: string;
      asset_name: string;
      asset_type: string;
      asset_status: string | null;
      asset_location: string | null;
      asset_machine_image_url: string | null;
      asset_plant_id: string | null;
      asset_department_id: string | null;
      asset_module_id: string | null;
      asset_qr_code_id: string | null;
      plant_id: string | null;
      plant_code: string | null;
      plant_name: string | null;
      department_id: string | null;
      department_code: string | null;
      department_name: string | null;
      module_id: string | null;
      module_code: string | null;
      module_name: string | null;
    }>();
}

export function toResolvedPayload(req: RequestLike, token: string, row: NonNullable<Awaited<ReturnType<typeof findQrResolutionRow>>>) {
  return {
    token,
    asset: {
      id: row.asset_id,
      code: row.asset_code,
      name: row.asset_name,
      assetType: row.asset_type,
      qrCodeId: row.asset_qr_code_id,
      status: row.asset_status,
      location: row.asset_location,
      machineImageUrl: row.asset_machine_image_url,
    },
    hierarchy: {
      plant: row.plant_id ? { id: row.plant_id, code: row.plant_code, name: row.plant_name } : null,
      department: row.department_id ? { id: row.department_id, code: row.department_code, name: row.department_name } : null,
      module: row.module_id ? { id: row.module_id, code: row.module_code, name: row.module_name } : null,
    },
    links: toScanLinks(req, token, {
      assetId: row.asset_id,
      assetCode: row.asset_code,
      departmentId: row.asset_department_id,
      moduleId: row.asset_module_id,
      departmentCode: row.department_code,
      moduleCode: row.module_code,
    }),
  };
}
