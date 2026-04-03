import { ensurePlantAccess } from '../middlewares/permissions';
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
        roles: ['ADMIN'],
        accessAllPlants: false,
        plantIds: ['plant-a'],
      },
    } as any;

    expect(() => ensurePlantAccess(req, 'plant-a')).not.toThrow();
    expect(() => ensurePlantAccess(req, 'plant-b')).toThrow('Plant access denied');
  });

  it('allows global roles to resolve QR from any plant', () => {
    const superAdminReq = {
      auth: {
        roles: ['SUPERADMIN'],
        accessAllPlants: true,
        plantIds: [],
      },
    } as any;

    expect(() => ensurePlantAccess(superAdminReq, 'plant-a')).not.toThrow();
    expect(() => ensurePlantAccess(superAdminReq, null)).not.toThrow();
  });
});
