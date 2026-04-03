import { enforcePlantScope, isGlobalRole, resolvePlantFilter } from '../utils/plantScope';
import type { AuthContext } from '../types/auth';

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    email: 'user@example.com',
    roles: ['USER'],
    roleKey: 'USER',
    rolePrecedence: 0,
    scopeType: 'PLANT',
    organizationId: null,
    orgRoleId: null,
    plantIds: ['plant-a'],
    activePlantId: 'plant-a',
    permissions: {},
    accessAllPlants: false,
    ...overrides,
  };
}

describe('plant scope utilities', () => {
  it('treats ROOT_ADMIN and SUPERADMIN as global scopes', () => {
    expect(isGlobalRole('ROOT_ADMIN', ['ROOT_ADMIN'], null)).toBe(true);
    expect(isGlobalRole('SUPERADMIN', ['SUPERADMIN'], 'org-1')).toBe(true);
    expect(isGlobalRole('ADMIN', ['ADMIN'], 'org-1')).toBe(false);
  });

  it('does not force a plant filter for ROOT_ADMIN list requests', () => {
    const rootAuth = authContext({
      roles: ['ROOT_ADMIN'],
      roleKey: 'ROOT_ADMIN',
      scopeType: 'ROOT_ADMIN',
      plantIds: [],
      activePlantId: null,
      accessAllPlants: true,
    });

    expect(resolvePlantFilter(rootAuth)).toBeNull();
    expect(resolvePlantFilter(rootAuth, 'plant-b')).toEqual(['plant-b']);
  });

  it('preserves all organization plants for SUPERADMIN list requests', () => {
    const superAuth = authContext({
      roles: ['SUPERADMIN'],
      roleKey: 'SUPERADMIN',
      scopeType: 'ORGANIZATION',
      organizationId: 'org-1',
      plantIds: ['plant-a', 'plant-b'],
      activePlantId: 'plant-a',
      accessAllPlants: true,
    });

    expect(resolvePlantFilter(superAuth)).toEqual(['plant-a', 'plant-b']);
    expect(resolvePlantFilter(superAuth, 'plant-b')).toEqual(['plant-b']);
  });

  it('allows ROOT_ADMIN to access any plant explicitly', () => {
    const rootAuth = authContext({
      roles: ['ROOT_ADMIN'],
      roleKey: 'ROOT_ADMIN',
      scopeType: 'ROOT_ADMIN',
      plantIds: [],
      activePlantId: null,
      accessAllPlants: true,
    });

    expect(() => enforcePlantScope(rootAuth, 'plant-b')).not.toThrow();
  });

  it('blocks plant access outside organization scope for SUPERADMIN', () => {
    const superAuth = authContext({
      roles: ['SUPERADMIN'],
      roleKey: 'SUPERADMIN',
      scopeType: 'ORGANIZATION',
      organizationId: 'org-1',
      plantIds: ['plant-a', 'plant-b'],
      activePlantId: 'plant-a',
      accessAllPlants: true,
    });

    expect(() => enforcePlantScope(superAuth, 'plant-c')).toThrow('Plant scope violation');
  });
});
