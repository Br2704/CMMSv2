import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { ReportFormatConfigEntity } from '../../database/entities/report-format-config.entity';
import { requireAuth } from '../../middlewares/authMiddleware';
import { requireRole } from '../../middlewares/permissions';
import { ok, fail } from '../../utils/apiResponse';
import { updateReportFormatSchema } from './report-format.validators';
import { bumpBrandingVersion } from '../../utils/brandingVersion';

const CONFIG_ID = 1;

async function getOrCreateConfig(): Promise<ReportFormatConfigEntity | null> {
  try {
    const repo = AppDataSource.getRepository(ReportFormatConfigEntity);
    let config = await repo.findOneBy({ id: CONFIG_ID });
    if (!config) {
      config = repo.create({ id: CONFIG_ID });
      config = await repo.save(config);
    }
    return config;
  } catch {
    return null;
  }
}

function serializeConfig(config: ReportFormatConfigEntity) {
  return {
    ...config,
    // Parse JSON strings back to objects for the frontend
    sheetsConfig: config.sheetsConfig ? tryParseJson(config.sheetsConfig) : null,
    chartConfig: config.chartConfig ? tryParseJson(config.chartConfig) : null,
    cellDefaults: config.cellDefaults ? tryParseJson(config.cellDefaults) : null,
  };
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const reportFormatRouter = Router();
reportFormatRouter.use(requireAuth);

reportFormatRouter.get('/report-format/config', async (_req, res, next) => {
  try {
    const config = await getOrCreateConfig();
    if (!config) {
      res.status(500).json(fail('Database operation failed: Could not access report_format_config table. Ensure database migrations have been run.'));
      return;
    }
    res.json(ok(serializeConfig(config), 'Report format configuration fetched'));
  } catch (error) {
    next(error);
  }
});

reportFormatRouter.put('/report-format/config', requireRole(['ROOT_ADMIN', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const body = updateReportFormatSchema.parse(req.body);
    const repo = AppDataSource.getRepository(ReportFormatConfigEntity);
    let config = await getOrCreateConfig();
    if (!config) {
      res.status(500).json(fail('Database operation failed: Could not access report_format_config table. Ensure database migrations have been run.'));
      return;
    }

    // Serialize JSON objects back to strings for storage
    const dataToSave: Record<string, unknown> = { ...body };
    if (body.sheetsConfig) {
      dataToSave.sheetsConfig = JSON.stringify(body.sheetsConfig);
    }
    if (body.chartConfig) {
      dataToSave.chartConfig = JSON.stringify(body.chartConfig);
    }
    if (body.cellDefaults) {
      dataToSave.cellDefaults = JSON.stringify(body.cellDefaults);
    }

    Object.assign(config, dataToSave);
    config = await repo.save(config);

    // Bump branding version so frontend watchers pick up the change
    await bumpBrandingVersion();

    res.json(ok(serializeConfig(config), 'Report format configuration updated'));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
      return;
    }
    next(error);
  }
});
