import { authorizePermission, canAccessWorkOrder } from '../utils/authorization';
import type { AuthContext } from '../types/auth';

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    email: 'user@example.com',
    roles: ['USER'],
    roleKey: 'USER',
    rolePrecedence: 0,
    scopeType: 'PLANT',
    organizationId: 'org-1',
    orgRoleId: null,
    department: 'MECH',
    teamIds: [],
    plantIds: ['plant-a'],
    activePlantId: 'plant-a',
    permissions: {},
    accessAllPlants: false,
    ...overrides,
  };
}

describe('enterprise authorization engine', () => {
  it('resolves module aliases through a single permission decision', () => {
    const decision = authorizePermission(
      authContext({ permissions: { SECURITY: ['READ'] } }),
      'security-center',
      'view',
    );

    expect(decision.allowed).toBe(true);
    expect(decision.moduleKey).toBe('SECURITY');
  });

  it('blocks governance mutations even when broad permissions are present', () => {
    const decision = authorizePermission(
      authContext({ roles: ['USER'], roleKey: 'USER', permissions: { ORGANIZATIONS: ['READ', 'UPDATE'] } }),
      'ORGANIZATIONS',
      'UPDATE',
    );

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe('GOVERNANCE_MUTATION_DENIED');
    }
  });

  it('allows work order access for assigned users and maintenance team members', () => {
    expect(canAccessWorkOrder(authContext(), { assigned_to: 'user-1' })).toBe(true);
    expect(canAccessWorkOrder(authContext({ teamIds: ['team-a'] }), { follow_up_team_id: 'team-a' })).toBe(true);
    expect(canAccessWorkOrder(authContext(), { assigned_to: 'user-2', raised_by: 'user-3' })).toBe(false);
  });
});
