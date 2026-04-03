import { afterEach, describe, expect, it, vi } from "vitest";
import { listOrganizations } from "@/api/organizations";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("organizations api adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses wrapped row payloads so organization cards can render", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          rows: [
            {
              id: "org-1",
              name: "Acme",
              code: "ACM",
              is_active: true,
              created_at: "2026-03-10T00:00:00.000Z",
              updated_at: "2026-03-10T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await listOrganizations({ page: 1, limit: 20 });

    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toMatchObject({
      id: "org-1",
      name: "Acme",
      code: "ACM",
      isActive: true,
    });
  });
});
