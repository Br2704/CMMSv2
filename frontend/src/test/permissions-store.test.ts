import { beforeEach, describe, expect, it, vi } from "vitest";

describe("permissions store RBAC sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("does not refetch permissions when RBAC version is unchanged", async () => {
    const getPermissionsMeMock = vi.fn();
    const getRbacVersionMock = vi.fn().mockResolvedValue({ success: true, data: { version: 7 } });

    vi.doMock("@/api/permissionsMe", () => ({
      getPermissionsMe: getPermissionsMeMock,
    }));
    vi.doMock("@/api/rbac", () => ({
      getRbacVersion: getRbacVersionMock,
    }));
    vi.doMock("@/api/http", () => ({
      getStoredAccessToken: () => "access-token",
    }));
    vi.doMock("@/store/auth.store", () => ({
      useAuthStore: {
        getState: () => ({ user: { id: "user-1" }, isLoading: false }),
      },
    }));

    const { usePermissionsStore } = await import("@/store/permissions.store");

    usePermissionsStore.setState({
      permissionsMe: {
        roles: ["ADMIN"],
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
