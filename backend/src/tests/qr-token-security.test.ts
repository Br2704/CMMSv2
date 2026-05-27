import { ensurePlantAccess } from '../middlewares/permissionGuard';
import { qrTokenParamSchema } from '../modules/qr/qr.validation';

describe('QR token validation and access checks', () => {
  it('accepts expected URL-safe token format', () => {
    const parsed = qrTokenParamSchema.parse({ token: 'i7Ki2zYoN-W4M6eQ2N6p8wV0vJQ_4J4F' });
    expect(parsed.token).toBe('i7Ki2zYoN-W4M6eQ2N6p8wV0vJQ_4J4F');
  });

  it('rejects malformed token format', () => {
    expect(() => qrTokenParamSchema.parse({ token: '../etc/passwd' })).toThrow();
    expect(() => qrTokenParamSchema.parse({ token: '<script>alert(1)</script>' })).toThrow();
  });

  it('enforces plant scoping for non-global users', () => {
    const req = {
      auth: {
        roles: ['PLANT_ADMIN'],
        accessAllPlants: false,
        plantIds: ['plant-a'],
      },
    } as any;

    expect(() => ensurePlantAccess(req, 'plant-a')).not.toThrow();
    expect(() => ensurePlantAccess(req, 'plant-b')).toThrow('Plant access denied');
  });

  it('allows ROOT_ADMIN to resolve QR from any plant', () => {
    const rootAdminReq = {
      auth: {
        roles: ['ROOT_ADMIN'],
        roleKey: 'ROOT_ADMIN',
        scopeType: 'ROOT_ADMIN',
        accessAllPlants: true,
        plantIds: [],
      },
    } as any;

    expect(() => ensurePlantAccess(rootAdminReq, 'plant-a')).not.toThrow();
    expect(() => ensurePlantAccess(rootAdminReq, null)).not.toThrow();
  });

  it('requires organization roles to have resolved plant scope', () => {
    const superAdminReq = {
      auth: {
        roles: ['SUPER_ADMIN'],
        roleKey: 'SUPER_ADMIN',
        scopeType: 'ORGANIZATION',
        accessAllPlants: true,
        plantIds: [],
      },
    } as any;

    expect(() => ensurePlantAccess(superAdminReq, 'plant-a')).toThrow('Plant access denied');
    expect(() => ensurePlantAccess(superAdminReq, null)).not.toThrow();
  });
});
