import {
  canAssignRole,
  canCreateUser,
  canDeleteRoleByPolicy,
  canViewUser,
  hasRootAdminAllowAll,
} from '../utils/policy';

describe('RBAC policy rules', () => {
  it('ROOT_ADMIN has allow-all policy', () => {
    expect(hasRootAdminAllowAll(['ROOT_ADMIN'])).toBe(true);
    expect(hasRootAdminAllowAll(['SUPERADMIN'])).toBe(false);
    expect(hasRootAdminAllowAll(['ADMIN', 'USER'])).toBe(false);
  });

  it('blocks role delete for system roles', () => {
    expect(canDeleteRoleByPolicy({ isSystem: true, assignedUsers: 0 })).toEqual({
      allowed: false,
      reason: 'SYSTEM_ROLE',
    });
  });

  it('blocks role delete when role is assigned to users', () => {
    expect(canDeleteRoleByPolicy({ isSystem: false, assignedUsers: 2 })).toEqual({
      allowed: false,
      reason: 'ROLE_ASSIGNED',
    });
  });

  it('enforces role creation and assignment escalation rules', () => {
    expect(canCreateUser('ROOT_ADMIN', 'ROOT_ADMIN')).toBe(true);
    expect(canCreateUser('SUPERADMIN', 'ROOT_ADMIN')).toBe(false);
    expect(canCreateUser('SUPERADMIN', 'ADMIN')).toBe(false);
    expect(canCreateUser('ADMIN', 'USER')).toBe(true);
    expect(canCreateUser('ADMIN', 'ADMIN')).toBe(false);

    expect(canAssignRole('ROOT_ADMIN', 'ROOT_ADMIN')).toBe(true);
    expect(canAssignRole('SUPERADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'SUPERADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'TECHNICIAN')).toBe(true);
  });

  it('restricts user visibility by role and plant scope', () => {
    const rootActor = {
      userId: 'u-root',
      roleKey: 'ROOT_ADMIN',
      roles: ['ROOT_ADMIN'],
      plantIds: [],
      accessAllPlants: true,
    };
    const superActor = {
      userId: 'u-super',
      roleKey: 'SUPERADMIN',
      roles: ['SUPERADMIN'],
      plantIds: [],
      accessAllPlants: true,
    };
    const adminActor = {
      userId: 'u-admin',
      roleKey: 'ADMIN',
      roles: ['ADMIN'],
      plantIds: ['plant-a'],
      accessAllPlants: false,
    };

    expect(canViewUser(rootActor, { userId: 'u-any', roleKeys: ['ROOT_ADMIN'], plantId: 'plant-a' })).toBe(true);
    expect(canViewUser(superActor, { userId: 'u-root-target', roleKeys: ['ROOT_ADMIN'], plantId: 'plant-a' })).toBe(false);
    expect(canViewUser(adminActor, { userId: 'u-super-target', roleKeys: ['SUPERADMIN'], plantId: 'plant-a' })).toBe(false);
    expect(canViewUser(adminActor, { userId: 'u-user-a', roleKeys: ['USER'], plantId: 'plant-a' })).toBe(true);
    expect(canViewUser(adminActor, { userId: 'u-user-b', roleKeys: ['USER'], plantId: 'plant-b' })).toBe(false);
  });
});
