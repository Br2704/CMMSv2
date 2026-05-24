import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineIndicator } from "@/components/layout/OfflineIndicator";

type MockHealthState = { healthy: boolean };

const mockHealthState: MockHealthState = {
  healthy: true,
};

vi.mock("@/hooks/useApiHealth", () => ({
  useApiHealth: () => ({ healthy: mockHealthState.healthy }),
}));

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
    writable: true,
  });
}

describe("OfflineIndicator", () => {
  beforeEach(() => {
    mockHealthState.healthy = true;
    setNavigatorOnline(true);
  });

  it("renders nothing when browser is online and API is healthy", () => {
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("renders offline banner when browser is offline", () => {
    setNavigatorOnline(false);

    render(<OfflineIndicator />);

    expect(screen.getByText("Offline Mode: Working from Local Cache")).toBeInTheDocument();
  });

  it("renders server-down banner when browser is online but API is unhealthy", () => {
    mockHealthState.healthy = false;

    render(<OfflineIndicator />);

    expect(screen.getByText("Server Unreachable — Retrying Connection")).toBeInTheDocument();
  });

  it("shows offline banner when both browser offline and API unhealthy — offline takes priority", () => {
    setNavigatorOnline(false);
    mockHealthState.healthy = false;

    render(<OfflineIndicator />);

    expect(screen.getByText("Offline Mode: Working from Local Cache")).toBeInTheDocument();
    expect(screen.queryByText("Server Unreachable — Retrying Connection")).not.toBeInTheDocument();
  });

  it("reacts to online/offline window events", () => {
    setNavigatorOnline(false);

    render(<OfflineIndicator />);

    expect(screen.getByText("Offline Mode: Working from Local Cache")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByText("Offline Mode: Working from Local Cache")).not.toBeInTheDocument();
    expect(screen.queryByText("Server Unreachable — Retrying Connection")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("Offline Mode: Working from Local Cache")).toBeInTheDocument();
  });

  it("cleans up event listeners on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OfflineIndicator />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });
});
