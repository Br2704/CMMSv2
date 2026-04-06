import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import pinoHttp from 'pino-http';
import { corsOptions } from './config/cors';
import { env } from './config/env';
import { logger } from './config/logger';
import { helmetOptions } from './config/security';
import { AppDataSource } from './database/data-source';
import { AssetEntity, AssetReliabilityKpiEntity } from './database/entities';
import { auditLogger } from './middlewares/auditLogger';
import { errorHandler } from './middlewares/errorHandler';
import { apiNotFoundHandler } from './middlewares/notFoundHandler';
import { exportsRateLimiter, generalApiRateLimiter, mutatingApiRateLimiter } from './middlewares/rateLimiter';
import { sanitizeInput } from './middlewares/sanitizeInput';
import { router } from './routes';
import { fail, ok } from './utils/apiResponse';
import { notFound } from './utils/httpError';
import { ensureAssetQr, findQrResolutionRow, findQrResolutionRowByMachineCode, toResolvedPayload } from './modules/qr/qr.shared';
import { emitDashboardRefresh } from './realtime/dashboard-socket';

const qrTokenParamSchema = z.object({
  token: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

const machineCodeParamSchema = z.object({
  machineCode: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._\- ]+$/),
});

async function enrichPublicQrPayload(payload: ReturnType<typeof toResolvedPayload>) {
  const reliabilityRepo = AppDataSource.getRepository(AssetReliabilityKpiEntity);
  const reliability = await reliabilityRepo.findOne({
    where: { assetId: payload.asset.id },
    order: { windowEnd: 'DESC' },
  });

  return {
    ...payload,
    asset: {
      ...payload.asset,
      reliability: reliability
        ? {
            mttrMinutes: reliability.mttrMinutes,
            mtbfMinutes: reliability.mtbfMinutes,
            downtimeMinutes: reliability.downtimeMinutes,
            windowEnd: reliability.windowEnd,
          }
        : null,
    },
  };
}

export const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(pinoHttp({ logger }));
app.use(helmet(helmetOptions));
app.use(cors(corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
app.use(generalApiRateLimiter);
app.use(mutatingApiRateLimiter);
app.use(sanitizeInput);
app.use(auditLogger);
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    next();
    return;
  }

  res.on('finish', () => {
    const isApiRequest = req.path.startsWith(env.API_PREFIX);
    const isSuccessfulMutation = res.statusCode >= 200 && res.statusCode < 500;
    if (isApiRequest && isSuccessfulMutation) {
      emitDashboardRefresh('mutation');
    }
  });

  next();
});
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith(`${env.API_PREFIX}/auth`)) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'CMMS Backend API',
    data: {
      health: '/health',
      ready: '/ready',
      apiBase: env.API_PREFIX,
    },
  });
});

app.get('/ready', (_req, res) => {
  if (!AppDataSource.isInitialized) {
    res.status(503).json(fail('Database not ready'));
    return;
  }
  res.status(200).json({ success: true, message: 'READY', data: { status: 'ok' } });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'OK', data: { status: 'ok' } });
});

app.get('/qr/:token', (req, res, next) => {
  const parsed = qrTokenParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json(fail('Invalid QR token'));
    return;
  }

  void (async () => {
    try {
      const token = parsed.data.token;
      const row = await findQrResolutionRow(token);
      const frontendBaseUrl = env.FRONTEND_URL.replace(/\/+$/, '');

      if (!row?.asset_code) {
        res.redirect(302, `${frontendBaseUrl}/qr/${encodeURIComponent(token)}`);
        return;
      }

      const resolverParams = new URLSearchParams();
      resolverParams.set('token', token);
      if (row.asset_id) resolverParams.set('assetId', row.asset_id);
      if (row.asset_department_id) resolverParams.set('departmentId', row.asset_department_id);
      if (row.asset_module_id) resolverParams.set('moduleId', row.asset_module_id);
      if (row.department_code) resolverParams.set('department', row.department_code);
      if (row.module_code) resolverParams.set('module', row.module_code);

      res.redirect(
        302,
        `${frontendBaseUrl}/assets/${encodeURIComponent(row.asset_code)}?${resolverParams.toString()}`,
      );
    } catch (error) {
      next(error);
    }
  })();
});

app.get(`${env.API_PREFIX}/qr/public/:token`, (req, res, next) => {
  const parsed = qrTokenParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json(fail('Invalid QR token'));
    return;
  }

  void (async () => {
    try {
      const token = parsed.data.token;
      const row = await findQrResolutionRow(token);
      if (!row) {
        notFound('QR token not found');
      }

      const payload = await enrichPublicQrPayload(toResolvedPayload(req, token, row));
      res.json(ok(payload));
    } catch (error) {
      next(error);
    }
  })();
});

app.get(`${env.API_PREFIX}/qr/public/machine/:machineCode`, (req, res, next) => {
  const parsedMachineCode = machineCodeParamSchema.safeParse(req.params);
  if (!parsedMachineCode.success) {
    res.status(400).json(fail('Invalid machine code'));
    return;
  }

  const rawToken = typeof req.query.token === 'string' ? req.query.token : null;
  const parsedToken = rawToken ? qrTokenParamSchema.safeParse({ token: rawToken }) : null;
  if (rawToken && (!parsedToken || !parsedToken.success)) {
    res.status(400).json(fail('Invalid QR token'));
    return;
  }
  const tokenFromQuery = parsedToken && parsedToken.success ? parsedToken.data.token : null;

  void (async () => {
    try {
      const machineCode = parsedMachineCode.data.machineCode;
      const rowByCode = await findQrResolutionRowByMachineCode(machineCode);
      if (!rowByCode) {
        notFound('Machine code not found');
      }

      let token = tokenFromQuery ?? rowByCode.qr_token;
      let resolvedRow = token ? await findQrResolutionRow(token) : null;

      if (!resolvedRow || resolvedRow.asset_id !== rowByCode.asset_id) {
        token = rowByCode.qr_token;
        resolvedRow = token ? await findQrResolutionRow(token) : null;
      }

      if (!token || !resolvedRow) {
        const assetRepo = AppDataSource.getRepository(AssetEntity);
        const asset = await assetRepo.findOneBy({ id: rowByCode.asset_id, isActive: true });
        if (!asset) {
          notFound('Machine code not found');
        }

        const qr = await ensureAssetQr(asset);
        token = qr.qrToken;
        resolvedRow = await findQrResolutionRow(token);
      }

      if (!token || !resolvedRow) {
        notFound('QR token not found for machine code');
      }

      const payload = await enrichPublicQrPayload(toResolvedPayload(req, token, resolvedRow));
      res.json(ok(payload));
    } catch (error) {
      next(error);
    }
  })();
});

app.use(`${env.API_PREFIX}/exports`, exportsRateLimiter);
app.use(env.API_PREFIX, router);
app.use(env.API_PREFIX, apiNotFoundHandler);
app.use(errorHandler);
