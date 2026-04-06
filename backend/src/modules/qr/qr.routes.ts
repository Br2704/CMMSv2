import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { AssetEntity, AssetQrEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ensurePlantAccess, requirePermission } from '../../middlewares/permissions';
import { validateRequest } from '../../middlewares/validate';
import { ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { notFound } from '../../utils/httpError';
import { generateQrToken } from '../../utils/qr';
import { assetIdParamSchema, qrTokenParamSchema } from './qr.validation';
import { ensureAssetQr, findQrResolutionRow, findQrResolutionRowByMachineCode, toResolvedPayload, toScanLinks } from './qr.shared';

export const qrRouter = Router();
const qrMachineCodeParamSchema = z.object({ machineCode: z.string().trim().min(1).max(120) });

qrRouter.use(requireAuth);

qrRouter.get('/assets/:id/qr', requirePermission('ASSETS', 'READ'), validateRequest({ params: assetIdParamSchema }), async (req, res, next) => {
  try {
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const asset = await assetRepo.findOneBy({ id: req.params.id, isActive: true });
    if (!asset) {
      notFound('Asset not found');
    }

    ensurePlantAccess(req, asset.plantId);
    const qr = await ensureAssetQr(asset);
    const resolved = await findQrResolutionRow(qr.qrToken);
    const links = resolved
      ? toResolvedPayload(req, qr.qrToken, resolved).links
      : toScanLinks(req, qr.qrToken, {
          assetId: asset.id,
          assetCode: asset.code,
          departmentId: asset.departmentId,
          moduleId: asset.moduleId,
        });

    await audit('assets.qr.generate', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'assets',
      entityId: asset.id,
      plantId: asset.plantId,
      statusCode: 200,
    });

    res.json(
      ok(
        {
          assetId: asset.id,
          assetCode: asset.code,
          assetName: asset.name,
          qrCodeId: asset.qrCodeId,
          qrToken: qr.qrToken,
          qrPayload: links.publicResolverUrl,
          ...links,
          generatedAt: qr.createdAt,
          rotatedAt: qr.rotatedAt,
        },
        'Asset QR fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

qrRouter.post('/assets/:id/qr/rotate', requirePermission('ASSETS', 'UPDATE'), validateRequest({ params: assetIdParamSchema }), async (req, res, next) => {
  try {
    const assetRepo = AppDataSource.getRepository(AssetEntity);
    const qrRepo = AppDataSource.getRepository(AssetQrEntity);
    const asset = await assetRepo.findOneBy({ id: req.params.id, isActive: true });
    if (!asset) {
      notFound('Asset not found');
    }

    ensurePlantAccess(req, asset.plantId);
    const existing = await ensureAssetQr(asset);
    existing.qrToken = generateQrToken();
    existing.rotatedAt = new Date();
    const updated = await qrRepo.save(existing);
    const resolved = await findQrResolutionRow(updated.qrToken);
    const links = resolved
      ? toResolvedPayload(req, updated.qrToken, resolved).links
      : toScanLinks(req, updated.qrToken, {
          assetId: asset.id,
          assetCode: asset.code,
          departmentId: asset.departmentId,
          moduleId: asset.moduleId,
        });

    await audit('assets.qr.rotate', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'asset_qr',
      entityId: updated.id,
      plantId: asset.plantId,
      statusCode: 200,
    });

    res.json(
      ok(
        {
          assetId: asset.id,
          qrCodeId: asset.qrCodeId,
          qrToken: updated.qrToken,
          qrPayload: links.publicResolverUrl,
          ...links,
          generatedAt: updated.createdAt,
          rotatedAt: updated.rotatedAt,
        },
        'Asset QR rotated',
      ),
    );
  } catch (error) {
    next(error);
  }
});

qrRouter.get('/qr/resolve/:token', requirePermission('ASSETS', 'READ'), validateRequest({ params: qrTokenParamSchema }), async (req, res, next) => {
  try {
    const row = await findQrResolutionRow(req.params.token);

    if (!row) {
      notFound('QR token not found');
    }

    ensurePlantAccess(req, row.asset_plant_id);

    await audit('assets.qr.resolve', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'asset_qr',
      entityId: row.asset_id,
      plantId: row.asset_plant_id,
      statusCode: 200,
    });

    res.json(
      ok(toResolvedPayload(req, req.params.token, row)),
    );
  } catch (error) {
    next(error);
  }
});

qrRouter.get('/qr/resolve-by-code/:machineCode', requirePermission('ASSETS', 'READ'), validateRequest({ params: qrMachineCodeParamSchema }), async (req, res, next) => {
  try {
    const machineCode = req.params.machineCode.trim();
    const byCodeRow = await findQrResolutionRowByMachineCode(machineCode);

    if (!byCodeRow) {
      notFound('Machine code not found');
    }

    ensurePlantAccess(req, byCodeRow.asset_plant_id);

    let token = byCodeRow.qr_token;
    if (!token) {
      const assetRepo = AppDataSource.getRepository(AssetEntity);
      const asset = await assetRepo.findOneBy({ id: byCodeRow.asset_id, isActive: true });
      if (!asset) {
        notFound('Asset not found');
      }
      const qr = await ensureAssetQr(asset);
      token = qr.qrToken;
    }

    if (!token) {
      notFound('QR token not found for machine code');
    }

    const resolvedByToken = await findQrResolutionRow(token);
    const resolvedPayloadRow = resolvedByToken ?? byCodeRow;

    await audit('assets.qr.resolve_by_code', {
      module: 'ASSETS',
      actorUserId: req.auth?.userId ?? null,
      entityName: 'asset_qr',
      entityId: byCodeRow.asset_id,
      plantId: byCodeRow.asset_plant_id,
      statusCode: 200,
    });

    res.json(ok(toResolvedPayload(req, token, resolvedPayloadRow)));
  } catch (error) {
    next(error);
  }
});
