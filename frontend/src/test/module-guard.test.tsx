import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModuleGuard } from "@/components/guards/ModuleGuard";

const mockPermissionState = {
  loading: false,
  allowed: true,
};

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    loading: mockPermissionState.loading,
    hasModuleAccess: () => mockPermissionState.allowed,
  }),
}));

describe("ModuleGuard", () => {
  beforeEach(() => {
    mockPermissionState.loading = false;
    mockPermissionState.allowed = true;
  });

  it("renders child content when access is allowed", () => {
    render(
      <MemoryRouter initialEntries={["/secured"]}>
        <Routes>
          <Route
            path="/secured"
            element={
              <ModuleGuard moduleId="assets">
                <div>secured content</div>
              </ModuleGuard>
            }
          />
          <Route path="/403" element={<div>forbidden page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("secured content")).toBeInTheDocument();
  });

  it("redirects to /403 when access is denied", () => {
    mockPermissionState.allowed = false;
    render(
      <MemoryRouter initialEntries={["/secured"]}>
        <Routes>
          <Route
            path="/secured"
            element={
              <ModuleGuard moduleId="assets">
                <div>secured content</div>
              </ModuleGuard>
            }
          />
          <Route path="/403" element={<div>forbidden page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("forbidden page")).toBeInTheDocument();
  });
});
