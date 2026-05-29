import { type Response, Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source';
import { OrgRoleEntity, OrganizationEntity, PlantEntity, ProfileEntity, UserEntity } from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { ok } from '../../utils/apiResponse';
import { getBrandingVersion } from '../../utils/brandingVersion';
import { resolveUserOrganizationScope } from '../../utils/userOrganization';
import { APP_BROWSER_TITLE, APP_DEFAULT_BACKGROUND_COLOR, APP_DEFAULT_THEME_COLOR, APP_NAME, APP_SIDEBAR_TITLE, APP_TAGLINE } from '../../config/branding';

const DEFAULT_THEME_COLOR = '#0f172a';
const DEFAULT_BG_COLOR = '#ffffff';
const DEFAULT_BRANDING = {
  organizationId: null as string | null,
  organizationName: null as string | null,
  organizationLogoUrl: null as string | null,
  organizationLogoAssetUrl: '/api/branding/logo',
  organizationFaviconUrl: '/tamoptix/tamoptix-favicon.svg' as string | null,
  sidebarTitle: APP_SIDEBAR_TITLE,
  browserTitle: APP_BROWSER_TITLE,
  brandColor: APP_DEFAULT_THEME_COLOR,
  fallbackLogoUrl: '/tamoptix/tamoptix-logo.svg',
  fallbackFaviconUrl: '/tamoptix/tamoptix-favicon.svg',
  updatedAt: null as string | null,
};

const brandingAssetQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  organizationCode: z.string().trim().min(1).max(64).optional(),
  size: z.coerce.number().int().optional().default(192),
});

const manifestQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  v: z.coerce.number().int().positive().optional(),
});

type ResolvedOrganization = {
  organization: OrganizationEntity | null;
  version: number;
  updatedAt: string;
};

function normalizeThemeColor(value: string | null | undefined) {
  if (!value) return DEFAULT_THEME_COLOR;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : DEFAULT_THEME_COLOR;
}


async function sendDefaultAsset(res: Response, kind: 'logo' | 'favicon', size: number) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (kind === 'favicon') {
    res.redirect('/tamoptix/tamoptix-favicon.svg');
    return;
  }
  if (size >= 512) {
    res.redirect('/tamoptix/tamoptix-logo.png');
    return;
  }
  res.redirect('/tamoptix/tamoptix-logo.svg');
}

function getBrandingAssetUrl(kind: 'logo' | 'favicon', organizationId: string | null, version: number, size: number) {
  const params = new URLSearchParams();
  if (organizationId) {
    params.set('organizationId', organizationId);
  }
  params.set('size', String(size >= 512 ? 512 : 192));
  params.set('v', String(version));
  return `/api/branding/${kind}?${params.toString()}`;
}

function getLogoAssetUrl(organizationId: string | null, version: number, size: number) {
  return getBrandingAssetUrl('logo', organizationId, version, size);
}

function getFaviconAssetUrl(organizationId: string | null, version: number, size: number) {
  return getBrandingAssetUrl('favicon', organizationId, version, size);
}

function getAppleTouchIconUrl(organizationId: string | null, version: number) {
  return getFaviconAssetUrl(organizationId, version, 192);
}

function getManifestIconUrl() {
  return '/tamoptix/tamoptix-favicon.svg';
}

async function resolveOrganizationIdForUser(userId: string, authPlantIds: string[] = []): Promise<string | null> {
  const resolved = await resolveUserOrganizationScope({ userId, authPlantIds });
  return resolved.organizationId;
}

async function resolveBrandingForAuthUser(input: {
  userId: string;
  authPlantIds?: string[];
  organizationId?: string | null;
}): Promise<ResolvedOrganization> {
  const organizationId = input.organizationId ?? (await resolveOrganizationIdForUser(input.userId, input.authPlantIds ?? []));
  const brandingMeta = await getBrandingVersion();
  if (!organizationId) {
    return { organization: null, version: brandingMeta.version, updatedAt: brandingMeta.updatedAt };
  }

  const organization = await AppDataSource.getRepository(OrganizationEntity).findOneBy({ id: organizationId });
  if (!organization || !organization.isActive) {
    return { organization: null, version: brandingMeta.version, updatedAt: brandingMeta.updatedAt };
  }

  return { organization, version: brandingMeta.version, updatedAt: brandingMeta.updatedAt };
}

async function resolveBrandingForLogoRequest(input?: {
  organizationId?: string | null;
  organizationCode?: string | null;
}): Promise<ResolvedOrganization> {
  const brandingMeta = await getBrandingVersion();
  const organizationId = input?.organizationId ?? null;
  const organizationCode = input?.organizationCode?.trim() ?? null;

  if (!organizationId && !organizationCode) {
    return { organization: null, version: brandingMeta.version, updatedAt: brandingMeta.updatedAt };
  }

  const organizationRepo = AppDataSource.getRepository(OrganizationEntity);
  const organization = organizationId
    ? await organizationRepo.findOneBy({ id: organizationId })
    : await organizationRepo
        .createQueryBuilder('organization')
        .where('LOWER(COALESCE(organization.code, \'\')) = LOWER(:organizationCode)', { organizationCode })
        .getOne();
  if (!organization || !organization.isActive) {
    return { organization: null, version: brandingMeta.version, updatedAt: brandingMeta.updatedAt };
  }

  return { organization, version: brandingMeta.version, updatedAt: brandingMeta.updatedAt };
}

async function sendOrganizationAsset(
  res: Response,
  kind: 'logo' | 'favicon',
  organization: OrganizationEntity | null,
  version: number,
  size: number,
) {
  const etag = `"branding-${kind}-${organization?.id ?? 'default'}-${version}-${size}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

  const rawAsset = (kind === 'favicon' ? organization?.faviconUrl : organization?.logoUrl)?.trim();
  if (!rawAsset) {
    await sendDefaultAsset(res, kind, size);
    return;
  }

  const dataUrlMatch = rawAsset.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const [, mimeType, encoded] = dataUrlMatch;
    res.type(mimeType);
    res.send(Buffer.from(encoded, 'base64'));
    return;
  }

  if (/^https?:\/\//i.test(rawAsset)) {
    try {
      const parsed = new URL(rawAsset);
      const allowedHosts = new Set([
        'localhost',
        '127.0.0.1',
        ...(process.env.FRONTEND_URL ? [new URL(process.env.FRONTEND_URL).hostname] : []),
        ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => { try { return new URL(o.trim()).hostname; } catch { return ''; } }).filter(Boolean) : []),
      ]);
      if (!allowedHosts.has(parsed.hostname)) {
        await sendDefaultAsset(res, kind, size);
        return;
      }
      res.redirect(parsed.href);
      return;
    } catch {
      await sendDefaultAsset(res, kind, size);
      return;
    }
  }

  if (rawAsset.startsWith('/')) {
    if (rawAsset.startsWith('/api/branding/logo') || rawAsset.startsWith('/api/branding/favicon')) {
      await sendDefaultAsset(res, kind, size);
      return;
    }
    try {
      const safePath = new URL(rawAsset, 'http://localhost').pathname;
      res.redirect(safePath);
    } catch {
      await sendDefaultAsset(res, kind, size);
    }
    return;
  }

  await sendDefaultAsset(res, kind, size);
}

export const brandingRouter = Router();

brandingRouter.get('/branding/logo', async (req, res, next) => {
  const parsedQuery = brandingAssetQuerySchema.safeParse(req.query);
  const fallbackSize = parsedQuery.success ? parsedQuery.data.size : 192;
  try {
    if (!parsedQuery.success) {
      await sendDefaultAsset(res, 'logo', fallbackSize);
      return;
    }

    const { organization, version } = await resolveBrandingForLogoRequest({
      organizationId: parsedQuery.data.organizationId ?? null,
      organizationCode: parsedQuery.data.organizationCode ?? null,
    });
    await sendOrganizationAsset(res, 'logo', organization, version, parsedQuery.data.size);
  } catch (error) {
    if (!res.headersSent) {
      await sendDefaultAsset(res, 'logo', fallbackSize);
      return;
    }
    next(error);
  }
});

brandingRouter.get('/branding/favicon', async (req, res, next) => {
  const parsedQuery = brandingAssetQuerySchema.safeParse(req.query);
  const fallbackSize = parsedQuery.success ? parsedQuery.data.size : 192;
  try {
    if (!parsedQuery.success) {
      await sendDefaultAsset(res, 'favicon', fallbackSize);
      return;
    }

    const { organization, version } = await resolveBrandingForLogoRequest({
      organizationId: parsedQuery.data.organizationId ?? null,
      organizationCode: parsedQuery.data.organizationCode ?? null,
    });
    await sendOrganizationAsset(res, 'favicon', organization, version, parsedQuery.data.size);
  } catch (error) {
    if (!res.headersSent) {
      await sendDefaultAsset(res, 'favicon', fallbackSize);
      return;
    }
    next(error);
  }
});

brandingRouter.get('/branding/me', requireAuth, async (req, res, next) => {
  try {
    const { organization, version, updatedAt } = await resolveBrandingForAuthUser({
      userId: req.auth!.userId,
      authPlantIds: req.auth?.plantIds ?? [],
      organizationId: req.auth?.organizationId ?? null,
    });
    const etag = `"branding-${version}"`;
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('ETag', etag);

    if (!organization) {
      res.json(ok({ ...DEFAULT_BRANDING, updatedAt }, 'Branding fetched'));
      return;
    }

    res.json(
      ok(
        {
          organizationId: organization.id,
          organizationName: organization.name,
          organizationLogoUrl: organization.logoUrl,
          organizationLogoAssetUrl: getLogoAssetUrl(organization.id, version, 192),
          organizationFaviconUrl: organization.faviconUrl ? getFaviconAssetUrl(organization.id, version, 192) : DEFAULT_BRANDING.fallbackFaviconUrl,
          sidebarTitle: organization.name,
          browserTitle: `${organization.name} CMMS`,
          brandColor: normalizeThemeColor(organization.brandColor),
          fallbackLogoUrl: DEFAULT_BRANDING.fallbackLogoUrl,
          fallbackFaviconUrl: DEFAULT_BRANDING.fallbackFaviconUrl,
          updatedAt,
        },
        'Branding fetched',
      ),
    );
  } catch (error) {
    next(error);
  }
});

brandingRouter.get('/branding/version', async (_req, res, next) => {
  try {
    const payload = await getBrandingVersion();
    const etag = `"branding-${payload.version}"`;
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('ETag', etag);
    res.json(ok({ version: payload.version, updatedAt: payload.updatedAt }, 'Branding version fetched'));
  } catch (error) {
    next(error);
  }
});

brandingRouter.get('/branding/manifest', async (req, res) => {
  const sendDefaultManifest = () => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      id: '/', name: APP_NAME, short_name: APP_NAME, description: APP_TAGLINE,
      start_url: '/', display: 'standalone', background_color: APP_DEFAULT_BACKGROUND_COLOR, theme_color: APP_DEFAULT_THEME_COLOR,
      icons: [
        { src: '/tamoptix/tamoptix-logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      ],
    });
  };

  try {
    if (res.headersSent) return;
    const parsedQuery = manifestQuerySchema.safeParse(req.query);
    let organization: OrganizationEntity | null = null;
    try {
      const result = parsedQuery.success
        ? await resolveBrandingForLogoRequest({ organizationId: parsedQuery.data.organizationId ?? null })
        : await resolveBrandingForLogoRequest();
      organization = result.organization ?? null;
    } catch {
      // Fall through to default manifest
    }
    const themeColor = normalizeThemeColor(organization?.brandColor as string | null | undefined);
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.json({
      id: '/',
      name: APP_NAME,
      short_name: APP_NAME,
      description: APP_TAGLINE,
      start_url: '/',
      display: 'standalone',
      background_color: DEFAULT_BG_COLOR,
      theme_color: themeColor,
      icons: [
        { src: '/tamoptix/tamoptix-logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/tamoptix/tamoptix-logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    });
  } catch {
    if (!res.headersSent) sendDefaultManifest();
  }
});
