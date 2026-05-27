import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPermissionsMeMock, getRbacVersionMock } = vi.hoisted(() => ({
  getPermissionsMeMock: vi.fn(),
  getRbacVersionMock: vi.fn().mockResolvedValue({ success: true, data: { version: 7 } }),
}));

vi.mock("@/api/permissionsMe", () => ({
  getPermissionsMe: getPermissionsMeMock,
}));
vi.mock("@/api/rbac", () => ({
  getRbacVersion: getRbacVersionMock,
  getOrganizationRbacVersion: vi.fn(),
  getRbacPermissionsMe: vi.fn(),
}));
vi.mock("@/api/token", () => ({
  getStoredAccessToken: () => "access-token",
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: {
    getState: () => ({ user: { id: "user-1" }, isLoading: false }),
  },
}));

describe("permissions store RBAC sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not refetch permissions when RBAC version is unchanged", async () => {
    const { usePermissionsStore } = await import("@/store/permissions.store");

    usePermissionsStore.setState({
      permissionsMe: {
        roles: ["PLANT_ADMIN"],
        permissions: { ASSETS: ["READ"] },
        kpis: [],
        plantIds: [],
        accessAllPlants: false,
      },
      rbacVersion: 7,
      rbacVersionEndpointAvailable: true,
      loading: false,
      fetchedAt: Date.now(),
      lastSyncedAt: Date.now(),
    });

    await usePermissionsStore.getState().fetchRbacVersion(true);

    expect(getRbacVersionMock).toHaveBeenCalledTimes(1);
    expect(getPermissionsMeMock).not.toHaveBeenCalled();
    expect(usePermissionsStore.getState().rbacVersion).toBe(7);
  });
});
