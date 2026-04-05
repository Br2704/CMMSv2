import { Router, type Request, type Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppDataSource } from '../../database/data-source';
import {
  OrganizationEntity,
  PlantEntity,
  ProfileEntity,
  RefreshTokenEntity,
  RoleDashboardKpiEntity,
  RolePermissionEntity,
  UserRoleEntity,
  UserEntity,
} from '../../database/entities';
import { requireAuth } from '../../middlewares/authMiddleware';
import { authLoginRateLimiter, authLogoutRateLimiter, authRefreshRateLimiter } from '../../middlewares/rateLimiter';
import { validateRequest } from '../../middlewares/validate';
import { fail, ok } from '../../utils/apiResponse';
import { audit } from '../../utils/audit';
import { decryptSensitiveValue, encryptSensitiveValue } from '../../utils/crypto';
import { signAccessToken, signChallengeToken, signRefreshToken, verifyChallengeToken, verifyRefreshToken } from '../../utils/jwt';
import { comparePassword, hashPassword } from '../../utils/password';
import {
  allowedRoleTargetsForCreate,
  allowedRoleTargetsForEdit,
  getPrimaryRoleKey,
  rolePrecedence,
} from '../../utils/policy';
import {
  DASHBOARD_KPI_KEYS,
  RBAC_ACTIONS,
  RBAC_MODULE_KEYS,
  isRootAdminRole,
  resolveScopeType,
  isSuperAdminRole,
  normalizeActions,
  normalizeModuleKey,
  normalizeRoleName,
  permissionKeysFromMap,
} from '../../utils/rbac';
import { recordSecurityEvent } from '../../utils/securityEvents';
import { buildTotpOtpauthUri, generateTotpSecret, verifyTotpCode } from '../../utils/totp';
import { resolveUserOrganizationScope } from '../../utils/userOrganization';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().trim().optional(),
  mfaCode: z.string().trim().regex(/^\d{6}$/).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

const mfaEnableSchema = z.object({
  setupToken: z.string().min(16),
  code: z.string().trim().regex(/^\d{6}$/),
});

const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/).optional(),
});

const CSRF_HEADER_NAME = 'x-csrf-token';
const SESSION_COOKIE_NAME = 'cmms_session';
const REFRESH_ROTATION_GRACE_MS = 15_000;
const REFRESH_SUCCESSOR_LOOKUP_LIMIT = 5;

function issueCsrfToken() {
  return randomBytes(32).toString('base64url');
}

function getRefreshCookieOptions() {
  return {
    httpOnly: true as const,
    secure: env.NODE_ENV === 'production',
    sameSite: (env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'lax' | 'strict',
    maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    path: `${env.API_PREFIX}/auth`,
  };
}

function getCsrfCookieOptions() {
  return {
    httpOnly: false as const,
    secure: env.NODE_ENV === 'production',
    sameSite: (env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'lax' | 'strict',
    maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function getSessionCookieOptions() {
  return {
    httpOnly: false as const,
    secure: env.NODE_ENV === 'production',
    sameSite: (env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'lax' | 'strict',
    maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function getClearCookieOptions<T extends { maxAge?: number }>(options: T): Omit<T, 'maxAge'> {
  const { maxAge: _ignored, ...clearOptions } = options;
  return clearOptions;
}

function setAuthCookies(res: Response, refreshToken: string, csrfToken: string) {
  const refreshCookieOptions = getRefreshCookieOptions();
  const csrfCookieOptions = getCsrfCookieOptions();
  const sessionCookieOptions = getSessionCookieOptions();
  res.clearCookie('cmms_refresh_token', getClearCookieOptions(refreshCookieOptions));
  res.cookie('cmms_refresh_token', refreshToken, {
    ...refreshCookieOptions,
  });
  res.clearCookie('cmms_csrf_token', getClearCookieOptions(csrfCookieOptions));
  res.cookie('cmms_csrf_token', csrfToken, {
    ...csrfCookieOptions,
  });
  res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions(sessionCookieOptions));
  res.cookie(SESSION_COOKIE_NAME, '1', {
    ...sessionCookieOptions,
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie('cmms_refresh_token', getClearCookieOptions(getRefreshCookieOptions()));
  res.clearCookie('cmms_csrf_token', getClearCookieOptions(getCsrfCookieOptions()));
  res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions(getSessionCookieOptions()));
}

function buildAuthTokenPayload(accessToken: string, csrfToken?: string) {
  return {
    accessToken,
    access_token: accessToken,
    ...(csrfToken
      ? {
          csrfToken,
          csrf_token: csrfToken,
        }
      : {}),
  };
}

function getHeaderValue(req: Request, key: string): string | undefined {
  const value = req.headers[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'string' ? value : undefined;
}

function validateCsrfForCookieRefresh(req: Request): boolean {
  const cookieToken = req.cookies?.cmms_csrf_token;
  const headerToken = getHeaderValue(req, CSRF_HEADER_NAME);
  return typeof cookieToken === 'string' && typeof headerToken === 'string' && cookieToken.length >= 24 && cookieToken === headerToken;
}

function normalizeRole(role: string) {
  return normalizeRoleName(role);
}

function getClientIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? null;
}

function normalizeClientIp(value: string | null) {
  if (!value) return null;
  if (value.startsWith('::ffff:')) {
    return value.slice('::ffff:'.length);
  }
  if (value === '::1') {
    return '127.0.0.1';
  }
  return value;
}

function isRefreshSessionExpired(row: RefreshTokenEntity, now = Date.now()) {
  return row.expiresAt.getTime() < now || (row.sessionExpiresAt ? row.sessionExpiresAt.getTime() < now : false);
}

function matchesRefreshSessionContext(row: RefreshTokenEntity, req: Request) {
  const requestIp = normalizeClientIp(getClientIp(req));
  const rowIp = normalizeClientIp(row.createdIp);
  const requestUserAgent = getUserAgent(req);

  if (rowIp && requestIp && rowIp !== requestIp) {
    return false;
  }
  if (row.createdUserAgent && requestUserAgent && row.createdUserAgent !== requestUserAgent) {
    return false;
  }
  return true;
}

async function findRefreshSuccessorRow(
  refreshRepo: Pick<Repository<RefreshTokenEntity>, 'findOneBy'>,
  userId: string,
  startId: string | null,
) {
  let currentId = startId;

  for (let hop = 0; hop < REFRESH_SUCCESSOR_LOOKUP_LIMIT; hop += 1) {
    if (!currentId) {
      return null;
    }

    const candidate = await refreshRepo.findOneBy({ id: currentId, userId });
    if (!candidate) {
      return null;
    }
    if (!candidate.revokedAt) {
      return candidate;
    }

    currentId = candidate.replacedByTokenId;
  }

  return null;
}

export async function resolveRefreshSessionRow(
  refreshRepo: Pick<Repository<RefreshTokenEntity>, 'findOneBy'>,
  row: RefreshTokenEntity | null,
  userId: string,
  req: Request,
) {
  if (!row || isRefreshSessionExpired(row)) {
    return null;
  }
  if (!row.revokedAt) {
    return row;
  }
  if (!row.replacedByTokenId) {
    return null;
  }
  if (Date.now() - row.revokedAt.getTime() > REFRESH_ROTATION_GRACE_MS) {
    return null;
  }
  if (!matchesRefreshSessionContext(row, req)) {
    return null;
  }

  const successor = await findRefreshSuccessorRow(refreshRepo, userId, row.replacedByTokenId);
  if (!successor || isRefreshSessionExpired(successor) || !matchesRefreshSessionContext(successor, req)) {
    return null;
  }

  return successor;
}

function getUserAgent(req: Request) {
  return typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
}

function buildCaptchaChallenge(email: string) {
  const left = Math.floor(Math.random() * 9) + 1;
  const right = Math.floor(Math.random() * 9) + 1;
  const answer = String(left + right);
  return {
    question: `What is ${left} + ${right}?`,
    token: signChallengeToken(
      {
        sub: email.trim().toLowerCase(),
        type: 'captcha',
        email: email.trim().toLowerCase(),
        answer,
      },
      '10m',
    ),
  };
}

function verifyCaptchaChallenge(email: string, token?: string, answer?: string) {
  if (!token || !answer) {
    return false;
  }
  try {
    const payload = verifyChallengeToken(token);
    return payload.type === 'captcha' && payload.email === email.trim().toLowerCase() && payload.answer === answer.trim();
  } catch {
    return false;
  }
}

async function buildMePayload(userId: string) {
  const userRepo = AppDataSource.getRepository(UserEntity);
  const profileRepo = AppDataSource.getRepository(ProfileEntity);
  const roleRepo = AppDataSource.getRepository(UserRoleEntity);
  const plantRepo = AppDataSource.getRepository(PlantEntity);
  const organizationRepo = AppDataSource.getRepository(OrganizationEntity);
  const permissionRepo = AppDataSource.getRepository(RolePermissionEntity);
  const roleKpiRepo = AppDataSource.getRepository(RoleDashboardKpiEntity);

  const [user, profile, userRoles] = await Promise.all([
    userRepo.findOneBy({ id: userId }),
    profileRepo.findOneBy({ userId }),
    roleRepo.find({ where: { userId } }),
  ]);

  if (!user) {
    return {
      user: null,
      profile: null,
      security: null,
      roles: [],
      roleKey: 'USER',
      rolePrecedence: rolePrecedence('USER'),
      allowedModules: [],
      allowedActionsByModule: {},
      allowedRoleTargetsForCreate: [],
      allowedRoleTargetsForEdit: [],
      kpiVisibility: [],
      plantId: null,
      plant: null,
      organizationId: null,
      organization: null,
    };
  }

  const normalizedRoles = userRoles.map((role) => normalizeRole(role.role));
  const normalizedSuperAdminEmail = env.SUPERADMIN_EMAIL.trim().toLowerCase();
  const normalizedUserEmail = user.email.trim().toLowerCase();
  const normalizedRootAdminEmail = env.ROOT_ADMIN_EMAIL.trim().toLowerCase();
  if (normalizedSuperAdminEmail && normalizedUserEmail === normalizedSuperAdminEmail && !normalizedRoles.includes('SUPERADMIN')) {
    normalizedRoles.unshift('SUPERADMIN');
  }
  if (normalizedRootAdminEmail && normalizedUserEmail === normalizedRootAdminEmail && !normalizedRoles.includes('ROOT_ADMIN')) {
    normalizedRoles.unshift('ROOT_ADMIN');
  }
  const roleIds = userRoles.map((role) => role.roleId).filter((value): value is string => Boolean(value));
  const roleKey = getPrimaryRoleKey(normalizedRoles);
  const scopeType = resolveScopeType(roleKey);
  const rolePrec = rolePrecedence(roleKey);
  const hasSystemGlobalRole = scopeType !== 'PLANT';
  const rolePlantIds = Array.from(new Set(userRoles.map((role) => role.plantId).filter((value): value is string => Boolean(value))));
  const inferredPlantId = rolePlantIds[0] ?? null;

  let resolvedProfile = profile;
  if (!resolvedProfile) {
    resolvedProfile = profileRepo.create({
      userId: user.id,
      userCode: `USR-${user.id.slice(0, 8).toUpperCase()}`,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profileImageUrl: null,
      plantId: hasSystemGlobalRole ? null : inferredPlantId,
      department: null,
      isActive: user.isActive,
    });
    resolvedProfile = await profileRepo.save(resolvedProfile);
  } else {
    const nextPlantId = hasSystemGlobalRole ? null : (resolvedProfile.plantId ?? inferredPlantId);
    const needsSync =
      resolvedProfile.fullName !== user.fullName ||
      resolvedProfile.email !== user.email ||
      resolvedProfile.phone !== user.phone ||
      resolvedProfile.isActive !== user.isActive ||
      resolvedProfile.plantId !== nextPlantId;

    if (needsSync) {
      resolvedProfile.fullName = user.fullName;
      resolvedProfile.email = user.email;
      resolvedProfile.phone = user.phone;
      resolvedProfile.isActive = user.isActive;
      resolvedProfile.plantId = nextPlantId;
      resolvedProfile = await profileRepo.save(resolvedProfile);
    }
  }

  const effectivePlantId = hasSystemGlobalRole ? null : (resolvedProfile.plantId ?? inferredPlantId);
  const plant = effectivePlantId ? await plantRepo.findOneBy({ id: effectivePlantId }) : null;
  const resolvedScope = await resolveUserOrganizationScope({
    user,
    profile: resolvedProfile,
    authPlantIds: rolePlantIds,
  });
  const resolvedOrganizationId = resolvedScope.organizationId ?? plant?.organizationId ?? null;
  const organization = resolvedOrganizationId ? await organizationRepo.findOneBy({ id: resolvedOrganizationId }) : null;
  const plantIds =
    scopeType === 'ORGANIZATION' && organization?.id
      ? (
          await plantRepo.find({
            where: { organizationId: organization.id, isActive: true },
            select: ['id'],
          })
        ).map((item) => item.id)
      : effectivePlantId
        ? [effectivePlantId]
        : [];
  const permissions = normalizedRoles.length || roleIds.length
    ? await permissionRepo.find({
        where: [
          ...normalizedRoles.map((role) => ({ role })),
          ...roleIds.map((roleId) => ({ roleId })),
        ],
      })
    : [];

  const permissionMap: Record<string, string[]> = {};
  permissions.forEach((permission) => {
    const moduleKey = normalizeModuleKey(permission.moduleKey ?? permission.moduleId);
    if (!permissionMap[moduleKey]) {
      permissionMap[moduleKey] = [];
    }
    normalizeActions(permission.actions).forEach((action) => {
      if (!permissionMap[moduleKey].includes(action)) {
        permissionMap[moduleKey].push(action);
      }
    });
  });

  if (normalizedRoles.some((role) => isSuperAdminRole(role))) {
    RBAC_MODULE_KEYS.forEach((moduleKey) => {
      permissionMap[moduleKey] = [...RBAC_ACTIONS];
    });
    permissionMap.PLANTS = ["READ", "UPDATE"];
  }

  const roleKpis = roleIds.length
    ? await roleKpiRepo.find({
        where: roleIds.map((roleId) => ({ roleId })),
        order: { displayOrder: 'ASC', createdAt: 'ASC' },
      })
    : [];
  const kpiVisibility = Array.from(
    roleKpis.reduce((acc, item) => {
      const existing = acc.get(item.kpiKey);
      if (!existing || item.displayOrder < existing.displayOrder) {
        acc.set(item.kpiKey, {
          kpiKey: item.kpiKey,
          isVisible: item.isVisible,
          displayOrder: item.displayOrder,
        });
      }
      return acc;
    }, new Map<string, { kpiKey: string; isVisible: boolean; displayOrder: number }>()),
  )
    .map(([, value]) => value)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  if (normalizedRoles.some((role) => isSuperAdminRole(role))) {
    kpiVisibility.length = 0;
    DASHBOARD_KPI_KEYS.forEach((kpiKey, index) => {
      kpiVisibility.push({
        kpiKey,
        isVisible: true,
        displayOrder: index,
      });
    });
  } else if (normalizedRoles.some((role) => isRootAdminRole(role))) {
    // ROOT_ADMIN is governance-only; CMMS operational KPIs are hidden.
    kpiVisibility.length = 0;
  }
  const permissionKeys = permissionKeysFromMap(permissionMap);

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      isActive: user.isActive,
    },
    profile: {
      id: resolvedProfile.id,
      userId: resolvedProfile.userId,
      userCode: resolvedProfile.userCode,
      fullName: resolvedProfile.fullName,
      email: resolvedProfile.email,
      phone: resolvedProfile.phone,
      profileImageUrl: resolvedProfile.profileImageUrl,
      plantId: effectivePlantId,
      department: resolvedProfile.department,
      isActive: resolvedProfile.isActive,
    },
    roles: normalizedRoles,
    security: {
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
    },
    roleKey,
    scopeType,
    rolePrecedence: rolePrec,
    allowedModules: Object.keys(permissionMap),
    allowedActionsByModule: permissionMap,
    permissionKeys,
    allowedRoleTargetsForCreate: allowedRoleTargetsForCreate(roleKey),
    allowedRoleTargetsForEdit: allowedRoleTargetsForEdit(roleKey),
    kpiVisibility,
    plantId: effectivePlantId,
    plant: plant
      ? {
          id: plant.id,
          plantCode: plant.plantCode,
          plantName: plant.plantName,
        }
      : null,
    organizationId: resolvedOrganizationId,
    plantIds,
    accessAllPlants: scopeType !== 'PLANT',
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          code: organization.code,
          logoUrl: organization.logoUrl,
        }
      : null,
  };
}

async function registerLoginFailure(input: {
  user: UserEntity | null;
  req: Request;
  email: string;
  reason: string;
}) {
  const ipAddress = getClientIp(input.req);
  const userAgent = getUserAgent(input.req);
  const userRepo = AppDataSource.getRepository(UserEntity);
  let locked = false;
  let retryAfterSeconds: number | null = null;
  let captchaChallenge: { question: string; token: string } | null = null;

  if (input.user) {
    input.user.failedLoginCount += 1;
    if (input.user.failedLoginCount >= env.LOGIN_LOCKOUT_THRESHOLD) {
      input.user.lockedUntil = new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60 * 1000);
      locked = true;
      retryAfterSeconds = env.LOGIN_LOCKOUT_MINUTES * 60;
    }
    await userRepo.save(input.user);

    if (input.user.failedLoginCount >= env.LOGIN_CAPTCHA_THRESHOLD) {
      captchaChallenge = buildCaptchaChallenge(input.email);
    }
  }

  await recordSecurityEvent({
    userId: input.user?.id ?? null,
    organizationId: input.user?.organizationId ?? null,
    eventType: locked ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
    severity: locked ? 'HIGH' : 'MEDIUM',
    module: 'AUTH',
    action: 'LOGIN',
    path: input.req.originalUrl,
    message: locked
      ? `Account locked after repeated failed logins for ${input.email}`
      : `Failed login attempt for ${input.email}`,
    ipAddress,
    userAgent,
    metadata: {
      email: input.email,
      failedLoginCount: input.user?.failedLoginCount ?? null,
      reason: input.reason,
    },
    notify: locked,
  });

  return { locked, retryAfterSeconds, captchaChallenge };
}

async function resetLoginSecurityState(user: UserEntity, req: Request) {
  const userRepo = AppDataSource.getRepository(UserEntity);
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  user.lastLoginIp = getClientIp(req);
  await userRepo.save(user);
}

async function issueTokens(
  user: UserEntity,
  options?: {
    req?: Request;
    sessionExpiresAt?: Date | null;
    mfaVerified?: boolean;
  },
) {
  const roleRepo = AppDataSource.getRepository(UserRoleEntity);
  const refreshRepo = AppDataSource.getRepository(RefreshTokenEntity);
  const roles = await roleRepo.find({ where: { userId: user.id } });
  const roleNames = roles.map((role) => normalizeRole(role.role));
  const normalizedSuperAdminEmail = env.SUPERADMIN_EMAIL.trim().toLowerCase();
  const normalizedRootAdminEmail = env.ROOT_ADMIN_EMAIL.trim().toLowerCase();
  const normalizedUserEmail = user.email.trim().toLowerCase();
  if (normalizedSuperAdminEmail && normalizedUserEmail === normalizedSuperAdminEmail && !roleNames.includes('SUPERADMIN')) {
    roleNames.unshift('SUPERADMIN');
  }
  if (normalizedRootAdminEmail && normalizedUserEmail === normalizedRootAdminEmail && !roleNames.includes('ROOT_ADMIN')) {
    roleNames.unshift('ROOT_ADMIN');
  }
  const allPlantIds = Array.from(new Set(roles.map((role) => role.plantId).filter((value): value is string => Boolean(value))));
  const scopeType = resolveScopeType(getPrimaryRoleKey(roleNames));
  const isOrganizationScope = scopeType === 'ORGANIZATION';
  const plantIds = isOrganizationScope ? allPlantIds : allPlantIds.slice(0, 1);

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    roles: roleNames,
    plantIds,
    accessAllPlants: isOrganizationScope,
    mfaVerified: options?.mfaVerified ?? !user.mfaEnabled,
  });

  const tokenId = randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, tokenId });
  const tokenHash = await hashPassword(refreshToken);
  const sessionExpiresAt =
    options?.sessionExpiresAt ?? new Date(Date.now() + env.AUTH_SESSION_MAX_HOURS * 60 * 60 * 1000);

  const row = refreshRepo.create({
    id: tokenId,
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000),
    revokedAt: null,
    sessionExpiresAt,
    createdIp: options?.req ? getClientIp(options.req) : null,
    createdUserAgent: options?.req ? getUserAgent(options.req) : null,
    replacedByTokenId: null,
  });
  await refreshRepo.save(row);

  return { accessToken, refreshToken, refreshTokenId: row.id, sessionExpiresAt };
}

export const authRouter = Router();

authRouter.post('/auth/login', authLoginRateLimiter, validateRequest({ body: loginSchema }), async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const normalizedEmail = payload.email.toLowerCase();
    const userRepo = AppDataSource.getRepository(UserEntity);
    const user = await userRepo.findOne({ where: { email: normalizedEmail } });
    if (!user || !user.isActive) {
      await registerLoginFailure({
        user: user ?? null,
        req,
        email: normalizedEmail,
        reason: !user ? 'user_not_found' : 'user_inactive',
      });
      res.status(401).json(fail('Invalid credentials'));
      return;
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json(
        fail('Too many failed login attempts. Please retry later.', {
          code: 'ACCOUNT_LOCKED',
          retryAfterSeconds,
          lockedUntil: user.lockedUntil.toISOString(),
        }),
      );
      return;
    }

    const captchaRequired = user.failedLoginCount >= env.LOGIN_CAPTCHA_THRESHOLD;
    if (captchaRequired && !verifyCaptchaChallenge(normalizedEmail, payload.captchaToken, payload.captchaAnswer)) {
      const challenge = buildCaptchaChallenge(normalizedEmail);
      await recordSecurityEvent({
        userId: user.id,
        organizationId: user.organizationId,
        eventType: 'AUTH_CAPTCHA_REQUIRED',
        severity: 'MEDIUM',
        module: 'AUTH',
        action: 'LOGIN',
        path: req.originalUrl,
        message: `Captcha challenge required for ${normalizedEmail}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: {
          failedLoginCount: user.failedLoginCount,
        },
      });
      res.status(403).json(
        fail('Captcha verification required', {
          code: 'CAPTCHA_REQUIRED',
          captchaRequired: true,
          captcha: challenge,
        }),
      );
      return;
    }

    const passwordOk = await comparePassword(payload.password, user.passwordHash);
    if (!passwordOk) {
      const failure = await registerLoginFailure({
        user,
        req,
        email: normalizedEmail,
        reason: 'invalid_password',
      });
      if (failure.locked) {
        res.setHeader('Retry-After', String(failure.retryAfterSeconds ?? env.LOGIN_LOCKOUT_MINUTES * 60));
        res.status(429).json(
          fail('Too many failed login attempts. Please retry later.', {
            code: 'ACCOUNT_LOCKED',
            retryAfterSeconds: failure.retryAfterSeconds,
            captcha: failure.captchaChallenge,
          }),
        );
        return;
      }
      res.status(401).json(
        fail('Invalid credentials', failure.captchaChallenge ? { code: 'CAPTCHA_REQUIRED', captcha: failure.captchaChallenge } : undefined),
      );
      return;
    }

    let me: any;
    try {
      me = await buildMePayload(user.id);
    } catch (error) {
      logger.error({ error, route: 'POST /auth/login', userId: user.id }, 'Failed to build full auth payload; using minimal fallback payload');
      const fallbackProfile = await AppDataSource.getRepository(ProfileEntity).findOneBy({ userId: user.id }).catch(() => null);
      me = {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          isActive: user.isActive,
        },
        profile: fallbackProfile
          ? {
              id: fallbackProfile.id,
              userId: fallbackProfile.userId,
              userCode: fallbackProfile.userCode,
              fullName: fallbackProfile.fullName,
              email: fallbackProfile.email,
              phone: fallbackProfile.phone,
              profileImageUrl: fallbackProfile.profileImageUrl,
              plantId: fallbackProfile.plantId,
              department: fallbackProfile.department,
              isActive: fallbackProfile.isActive,
            }
          : null,
        roles: [],
        security: {
          mfaEnabled: user.mfaEnabled,
          lastLoginAt: user.lastLoginAt,
          lastLoginIp: user.lastLoginIp,
        },
        roleKey: 'USER',
        scopeType: 'PLANT',
        rolePrecedence: rolePrecedence('USER'),
        allowedModules: [],
        allowedActionsByModule: {},
        permissionKeys: [],
        allowedRoleTargetsForCreate: [],
        allowedRoleTargetsForEdit: [],
        kpiVisibility: [],
        plantId: fallbackProfile?.plantId ?? null,
        plant: null,
        organizationId: user.organizationId ?? null,
        plantIds: fallbackProfile?.plantId ? [fallbackProfile.plantId] : [],
        accessAllPlants: false,
        organization: null,
      };
    }
    const mfaRequired = user.mfaEnabled;
    if (mfaRequired) {
      if (!payload.mfaCode) {
        res.status(401).json(fail('Multi-factor authentication required', { code: 'MFA_REQUIRED' }));
        return;
      }

      try {
        const secret = user.mfaSecretEncrypted ? decryptSensitiveValue(user.mfaSecretEncrypted) : null;
        if (!secret || !verifyTotpCode(secret, payload.mfaCode)) {
          await recordSecurityEvent({
            userId: user.id,
            organizationId: user.organizationId,
            plantId: me.plantId ?? null,
            eventType: 'AUTH_MFA_FAILED',
            severity: 'HIGH',
            module: 'AUTH',
            action: 'LOGIN',
            path: req.originalUrl,
            message: `Invalid MFA code for ${normalizedEmail}`,
            ipAddress: getClientIp(req),
            userAgent: getUserAgent(req),
            notify: true,
          });
          res.status(401).json(fail('Invalid MFA code', { code: 'MFA_REQUIRED' }));
          return;
        }
      } catch {
        await recordSecurityEvent({
          userId: user.id,
          organizationId: user.organizationId,
          plantId: me.plantId ?? null,
          eventType: 'AUTH_MFA_FAILED',
          severity: 'HIGH',
          module: 'AUTH',
          action: 'LOGIN',
          path: req.originalUrl,
          message: `MFA secret is invalid for ${normalizedEmail}`,
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
          notify: true,
          metadata: {
            reason: 'mfa_secret_decrypt_failed',
          },
        });
        res.status(401).json(fail('MFA setup needs reset. Contact administrator.', { code: 'MFA_RESET_REQUIRED' }));
        return;
      }
    }

    try {
      await resetLoginSecurityState(user, req);
    } catch (error) {
      logger.error({ error, route: 'POST /auth/login', userId: user.id }, 'Failed to reset login security state; continuing login flow');
    }

    let accessToken = '';
    let csrfToken: string | undefined;
    try {
      const issued = await issueTokens(user, { req, mfaVerified: user.mfaEnabled });
      accessToken = issued.accessToken;
      csrfToken = issueCsrfToken();
      setAuthCookies(res, issued.refreshToken, csrfToken);
    } catch (error) {
      logger.error({ error, route: 'POST /auth/login', userId: user.id }, 'Failed to issue refresh session; issuing access token only');
      accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        roles: me.roles,
        plantIds: me.plantIds ?? [],
        accessAllPlants: Boolean(me.accessAllPlants),
        mfaVerified: user.mfaEnabled,
      });
    }
    try {
      await audit('auth.login', {
        userId: user.id,
        email: user.email,
        module: 'AUTH',
        statusCode: 200,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    } catch (error) {
      logger.error({ error, route: 'POST /auth/login', userId: user.id }, 'Failed to persist auth login audit event; continuing login flow');
    }

    try {
      await recordSecurityEvent({
        userId: user.id,
        organizationId: me.organizationId ?? null,
        plantId: me.plantId ?? null,
        eventType: 'AUTH_LOGIN_SUCCESS',
        severity: 'LOW',
        module: 'AUTH',
        action: 'LOGIN',
        path: req.originalUrl,
        message: `Successful login for ${normalizedEmail}`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        status: 'RESOLVED',
        metadata: {
          roles: me.roles,
        },
      });
    } catch (error) {
      logger.error({ error, route: 'POST /auth/login', userId: user.id }, 'Failed to persist auth login security event; continuing login flow');
    }

    res.status(200).json(ok({ ...buildAuthTokenPayload(accessToken, csrfToken), ...me }, 'Login successful'));
  } catch (error) {
    logger.error(
      {
        route: 'POST /auth/login',
        error,
      },
      'Login failed due to unexpected backend error',
    );
    if (!res.headersSent) {
      res.status(503).json(fail('Authentication service is temporarily unavailable. Please retry shortly.', { code: 'AUTH_DEPENDENCY_ERROR' }));
      return;
    }
    next(error);
  }
});

authRouter.post('/auth/refresh', authRefreshRateLimiter, validateRequest({ body: refreshSchema.partial() }), async (req, res, next) => {
  try {
    const payload = refreshSchema.parse(req.body ?? {});
    const refreshToken = payload.refreshToken ?? req.cookies?.cmms_refresh_token;
    const usingCookieRefreshToken = !payload.refreshToken;
    if (usingCookieRefreshToken && !validateCsrfForCookieRefresh(req)) {
      logger.warn({ route: 'POST /auth/refresh', reason: 'csrf_validation_failed' }, 'Refresh denied');
      await recordSecurityEvent({
        userId: req.auth?.userId ?? null,
        organizationId: req.auth?.organizationId ?? null,
        plantId: req.auth?.activePlantId ?? null,
        eventType: 'AUTH_REFRESH_CSRF_FAILED',
        severity: 'HIGH',
        module: 'AUTH',
        action: 'REFRESH',
        path: req.originalUrl,
        message: 'Refresh denied due to invalid CSRF token',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        notify: true,
      });
      clearAuthCookies(res);
      res.status(401).json(fail('Invalid CSRF token'));
      return;
    }
    if (!refreshToken) {
      logger.warn({ route: 'POST /auth/refresh', reason: 'missing_refresh_token' }, 'Refresh denied');
      clearAuthCookies(res);
      res.status(401).json(fail('Missing refresh token'));
      return;
    }

    let parsed: { sub: string; tokenId: string };
    try {
      parsed = verifyRefreshToken(refreshToken);
    } catch {
      logger.warn({ route: 'POST /auth/refresh', reason: 'refresh_token_verification_failed' }, 'Refresh denied');
      await recordSecurityEvent({
        eventType: 'AUTH_REFRESH_INVALID_TOKEN',
        severity: 'HIGH',
        module: 'AUTH',
        action: 'REFRESH',
        path: req.originalUrl,
        message: 'Refresh denied due to invalid refresh token',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        notify: true,
      });
      clearAuthCookies(res);
      res.status(401).json(fail('Invalid refresh token'));
      return;
    }
    const refreshRepo = AppDataSource.getRepository(RefreshTokenEntity);
    const userRepo = AppDataSource.getRepository(UserEntity);

    const row = await refreshRepo.findOneBy({ id: parsed.tokenId, userId: parsed.sub });
    const sessionRow = await resolveRefreshSessionRow(refreshRepo, row, parsed.sub, req);
    if (!sessionRow) {
      logger.warn({ route: 'POST /auth/refresh', userId: parsed.sub, reason: 'refresh_token_not_found_or_expired' }, 'Refresh denied');
      await recordSecurityEvent({
        userId: parsed.sub,
        eventType: 'AUTH_REFRESH_EXPIRED',
        severity: 'HIGH',
        module: 'AUTH',
        action: 'REFRESH',
        path: req.originalUrl,
        message: 'Refresh denied because refresh session expired or was revoked',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        notify: true,
      });
      clearAuthCookies(res);
      res.status(401).json(fail('Invalid refresh token'));
      return;
    }
    const presentedRow = row;
    if (!presentedRow) {
      clearAuthCookies(res);
      res.status(401).json(fail('Invalid refresh token'));
      return;
    }

    const match = await comparePassword(refreshToken, presentedRow.tokenHash);
    if (!match) {
      logger.warn({ route: 'POST /auth/refresh', userId: parsed.sub, reason: 'refresh_token_hash_mismatch' }, 'Refresh denied');
      await recordSecurityEvent({
        userId: parsed.sub,
        eventType: 'AUTH_REFRESH_HASH_MISMATCH',
        severity: 'CRITICAL',
        module: 'AUTH',
        action: 'REFRESH',
        path: req.originalUrl,
        message: 'Refresh denied because presented refresh token did not match stored hash',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        notify: true,
      });
      clearAuthCookies(res);
      res.status(401).json(fail('Invalid refresh token'));
      return;
    }

    const user = await userRepo.findOneBy({ id: parsed.sub });
    if (!user || !user.isActive) {
      logger.warn({ route: 'POST /auth/refresh', userId: parsed.sub, reason: 'user_not_active_or_missing' }, 'Refresh denied');
      clearAuthCookies(res);
      res.status(401).json(fail('Unauthorized'));
      return;
    }

    if (sessionRow.id !== presentedRow.id) {
      logger.info(
        {
          route: 'POST /auth/refresh',
          userId: parsed.sub,
          presentedTokenId: presentedRow.id,
          activeTokenId: sessionRow.id,
        },
        'Recovered refresh request during rotation grace window',
      );
    }

    const tokens = await issueTokens(user, {
      req,
      sessionExpiresAt: sessionRow.sessionExpiresAt ?? null,
      mfaVerified: user.mfaEnabled,
    });
    sessionRow.revokedAt = new Date();
    sessionRow.replacedByTokenId = tokens.refreshTokenId;
    await refreshRepo.save(sessionRow);
    const csrfToken = issueCsrfToken();
    setAuthCookies(res, tokens.refreshToken, csrfToken);

    const me = await buildMePayload(user.id);
    res.status(200).json(ok({ ...buildAuthTokenPayload(tokens.accessToken, csrfToken), ...me }, 'Token refreshed'));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/logout', authLogoutRateLimiter, validateRequest({ body: refreshSchema.partial() }), async (req, res, next) => {
  try {
    const payload = refreshSchema.partial().parse(req.body ?? {});
    const usingCookieRefreshToken = !payload.refreshToken;
    if (usingCookieRefreshToken && !validateCsrfForCookieRefresh(req)) {
      res.status(401).json(fail('Invalid CSRF token'));
      return;
    }
    const refreshToken = payload.refreshToken ?? req.cookies?.cmms_refresh_token;
    if (refreshToken) {
      try {
        const parsed = verifyRefreshToken(refreshToken);
        const refreshRepo = AppDataSource.getRepository(RefreshTokenEntity);
        const row = await refreshRepo.findOneBy({ id: parsed.tokenId, userId: parsed.sub });
        if (row && !row.revokedAt) {
          row.revokedAt = new Date();
          await refreshRepo.save(row);
        }
      } catch {
        // ignore invalid token during logout
      }
    }

    clearAuthCookies(res);
    if (req.auth?.userId) {
      await audit('auth.logout', {
        userId: req.auth.userId,
        module: 'AUTH',
        statusCode: 200,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    }
    res.status(200).json(ok({ loggedOut: true }, 'Logged out'));
  } catch (error) {
    next(error);
  }
});

authRouter.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const me = await buildMePayload(req.auth!.userId);
    res.status(200).json(ok(me));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/mfa/setup', requireAuth, async (req, res, next) => {
  try {
    const userRepo = AppDataSource.getRepository(UserEntity);
    const user = await userRepo.findOneBy({ id: req.auth!.userId });
    if (!user || !user.isActive) {
      res.status(401).json(fail('Unauthorized'));
      return;
    }

    const secret = generateTotpSecret();
    const setupToken = signChallengeToken(
      {
        sub: user.id,
        type: 'mfa_setup',
        secret,
      },
      '15m',
    );
    const otpauthUri = buildTotpOtpauthUri({ email: user.email, secret });
    res.json(
      ok(
        {
          setupToken,
          secret,
          otpauthUri,
          issuer: env.MFA_ISSUER,
        },
        'MFA setup initialized',
      ),
    );
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/mfa/enable', requireAuth, validateRequest({ body: mfaEnableSchema }), async (req, res, next) => {
  try {
    const body = mfaEnableSchema.parse(req.body);
    const payload = verifyChallengeToken(body.setupToken);
    if (payload.type !== 'mfa_setup' || payload.sub !== req.auth!.userId || !payload.secret) {
      res.status(400).json(fail('Invalid MFA setup token'));
      return;
    }
    if (!verifyTotpCode(payload.secret, body.code)) {
      res.status(400).json(fail('Invalid MFA code'));
      return;
    }

    const userRepo = AppDataSource.getRepository(UserEntity);
    const user = await userRepo.findOneBy({ id: req.auth!.userId });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }
    user.mfaEnabled = true;
    user.mfaSecretEncrypted = encryptSensitiveValue(payload.secret);
    await userRepo.save(user);

    await audit('auth.mfa.enable', {
      userId: user.id,
      module: 'AUTH',
      statusCode: 200,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    res.json(ok({ mfaEnabled: true }, 'MFA enabled'));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/mfa/disable', requireAuth, validateRequest({ body: mfaDisableSchema }), async (req, res, next) => {
  try {
    const body = mfaDisableSchema.parse(req.body);
    const userRepo = AppDataSource.getRepository(UserEntity);
    const user = await userRepo.findOneBy({ id: req.auth!.userId });
    if (!user) {
      res.status(404).json(fail('User not found'));
      return;
    }

    const passwordOk = await comparePassword(body.password, user.passwordHash);
    if (!passwordOk) {
      res.status(401).json(fail('Invalid password'));
      return;
    }

    if (user.mfaEnabled) {
      const secret = user.mfaSecretEncrypted ? decryptSensitiveValue(user.mfaSecretEncrypted) : null;
      if (!secret || !body.code || !verifyTotpCode(secret, body.code)) {
        res.status(401).json(fail('Invalid MFA code'));
        return;
      }
    }

    user.mfaEnabled = false;
    user.mfaSecretEncrypted = null;
    await userRepo.save(user);
    await audit('auth.mfa.disable', {
      userId: user.id,
      module: 'AUTH',
      statusCode: 200,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    res.json(ok({ mfaEnabled: false }, 'MFA disabled'));
  } catch (error) {
    next(error);
  }
});
