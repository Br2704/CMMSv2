import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RootOrganizationMaster from "@/pages/root/RootOrganizationMaster";
import { ApiError } from "@/api/http";

const listOrganizationsMock = vi.fn();
const listRootUsersMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/api/organizations", () => ({
  createOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  listOrganizations: (...args: unknown[]) => listOrganizationsMock(...args),
  updateOrganization: vi.fn(),
}));

vi.mock("@/api/rootUsers", () => ({
  listRootUsers: (...args: unknown[]) => listRootUsersMock(...args),
}));

vi.mock("@/store/auth.store", () => ({
  isRootAdmin: () => true,
  useAuthStore: () => ({
    user: {
      id: "root-user-1",
      organizationId: null,
      email: "root@example.com",
      phone: null,
      fullName: "Root Admin",
    },
  }),
}));

vi.mock("@/store/branding.store", () => ({
  useBrandingStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      organizationId: null,
      organizationName: null,
      logoUrl: null,
      fetchBranding: vi.fn(),
    }),
}));

describe("RootOrganizationMaster", () => {
  beforeEach(() => {
    listOrganizationsMock.mockReset();
    listRootUsersMock.mockReset();

    listOrganizationsMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: "org-1",
          name: "Acme Industries",
          code: "ACME",
          legalName: "Acme Industries Pvt Ltd",
          industry: null,
          registrationNumber: null,
          taxId: null,
          website: null,
          contactEmail: "ops@acme.test",
          contactPhone: null,
          primaryContactName: null,
          primaryContactEmail: null,
          primaryContactPhone: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          state: null,
          country: null,
          postalCode: null,
          notes: null,
          logoUrl: null,
          faviconUrl: null,
          brandColor: null,
          billingCycle: "MONTHLY",
          subscriptionStatus: "ACTIVE",
          hasFreeTrial: false,
          trialStartDate: null,
          trialEndDate: null,
          subscriptionStartDate: null,
          subscriptionEndDate: null,
          reminderEnabled: true,
          reminderLeadDays: 30,
          lastReminderSentAt: null,
          isActive: true,
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-10T00:00:00.000Z",
          plantsCount: 4,
          usersCount: 15,
          adminsCount: 2,
          superadminsCount: 1,
        },
      ],
    });
    listRootUsersMock.mockResolvedValue({
      success: true,
      data: [],
    });
  });

  it("loads organizations on mount and renders organization cards", async () => {
    render(
      <MemoryRouter>
        <RootOrganizationMaster />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(listOrganizationsMock).toHaveBeenCalledWith({
        page: 1,
        limit: 200,
        includeInactive: false,
      });
    });

    expect(await screen.findByText("Acme Industries")).toBeInTheDocument();
    expect(screen.getByText("Organizations (1)")).toBeInTheDocument();
  });

  it("shows a load error state instead of a false empty state when the request is unauthorized", async () => {
    listOrganizationsMock.mockRejectedValueOnce(new ApiError(401, "Unauthorized", null));

    render(
      <MemoryRouter>
        <RootOrganizationMaster />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Unable to load organizations")).toBeInTheDocument();
    expect(screen.getByText("Your session expired while loading organizations. Sign in again and retry.")).toBeInTheDocument();
  });
});
