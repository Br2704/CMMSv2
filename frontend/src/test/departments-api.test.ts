import { afterEach, describe, expect, it, vi } from "vitest";
import { listDepartments } from "@/api/departments";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("departments api adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes department status fields from snake_case payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          rows: [
            {
              id: "dept-1",
              code: "D-001",
              name: "Production",
              plant_id: "plant-1",
              parent_id: null,
              is_active: true,
              created_at: "2026-03-10T00:00:00.000Z",
              updated_at: "2026-03-10T00:00:00.000Z",
            },
          ],
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const response = await listDepartments({ page: 1, limit: 20 });

    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toMatchObject({
      id: "dept-1",
      code: "D-001",
      name: "Production",
      plantId: "plant-1",
      parentId: null,
      isActive: true,
    });
  });
});
