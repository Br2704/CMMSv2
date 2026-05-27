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
    expect(hasRootAdminAllowAll(['SUPER_ADMIN'])).toBe(false);
    expect(hasRootAdminAllowAll(['PLANT_ADMIN', 'MAINTENANCE_USER'])).toBe(false);
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
    expect(canCreateUser('SUPER_ADMIN', 'ROOT_ADMIN')).toBe(false);
    expect(canCreateUser('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canCreateUser('SUPER_ADMIN', 'PLANT_ADMIN')).toBe(false);
    expect(canCreateUser('PLANT_ADMIN', 'MAINTENANCE_USER')).toBe(true);
    expect(canCreateUser('PLANT_ADMIN', 'PLANT_ADMIN')).toBe(false);

    expect(canAssignRole('ROOT_ADMIN', 'ROOT_ADMIN')).toBe(true);
    expect(canAssignRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canAssignRole('SUPER_ADMIN', 'PLANT_ADMIN')).toBe(false);
    expect(canAssignRole('PLANT_ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canAssignRole('PLANT_ADMIN', 'MAINTENANCE_USER')).toBe(true);
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
      roleKey: 'SUPER_ADMIN',
      roles: ['SUPER_ADMIN'],
      plantIds: [],
      accessAllPlants: true,
    };
    const adminActor = {
      userId: 'u-admin',
      roleKey: 'PLANT_ADMIN',
      roles: ['PLANT_ADMIN'],
      plantIds: ['plant-a'],
      accessAllPlants: false,
    };

    expect(canViewUser(rootActor, { userId: 'u-any', roleKeys: ['ROOT_ADMIN'], plantId: 'plant-a' })).toBe(true);
    expect(canViewUser(superActor, { userId: 'u-root-target', roleKeys: ['ROOT_ADMIN'], plantId: 'plant-a' })).toBe(false);
    expect(canViewUser(adminActor, { userId: 'u-super-target', roleKeys: ['SUPER_ADMIN'], plantId: 'plant-a' })).toBe(false);
    expect(canViewUser(adminActor, { userId: 'u-user-a', roleKeys: ['MAINTENANCE_USER'], plantId: 'plant-a' })).toBe(true);
    expect(canViewUser(adminActor, { userId: 'u-user-b', roleKeys: ['MAINTENANCE_USER'], plantId: 'plant-b' })).toBe(false);
  });
});
