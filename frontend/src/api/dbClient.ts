import { ApiError, httpRequest } from "@/api/http";
import { getStoredAccessToken } from "@/api/token";

type ApiResult<T> = {
  data: T | null;
  error: { message: string; status?: number } | null;
  count?: number | null;
};

const tableToEndpoint: Record<string, string> = {
  plants: "/plants",
  profiles: "/profiles",
  user_roles: "/user-roles",
  role_permissions: "/role-permissions",
  departments: "/departments",
  cost_centers: "/cost-centers",
  vendors: "/vendors",
  assets: "/assets",
  work_orders: "/work-orders",
  pm_schedules: "/pm-schedules",
  spare_items: "/inventory",
  stock_requests: "/stock-requests",
  calibration_records: "/calibration",
  amc_contracts: "/amc",
  gates: "/gates",
  gate_entries: "/gate-entries",
  notifications: "/notifications",
  shifts: "/shifts",
  log_templates: "/log-templates",
  log_template_fields: "/log-template-fields",
  log_template_assignments: "/log-template-assignments",
  log_entries: "/log-entries",
  log_entry_values: "/log-entry-values",
  esg_metrics: "/esg/metrics",
  safety_incidents: "/safety/incidents",
  safety_metrics: "/safety/metrics",
  email_report_schedules: "/reports/schedules",
  email_report_logs: "/reports/history",
  vendor_notification_settings: "/vendor-notification-settings",
};

function toSnakeKey(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function toCamelKey(input: string): string {
  return input.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function toSnakeCase<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toSnakeCase(item)) as T;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.entries(obj).forEach(([key, item]) => {
      out[toSnakeKey(key)] = toSnakeCase(item);
    });
    return out as T;
  }
  return value;
}

function toCamelCase<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toCamelCase(item)) as T;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.entries(obj).forEach(([key, item]) => {
      out[toCamelKey(key)] = toCamelCase(item);
    });
    return out as T;
  }
  return value;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const isAuthPath = path.startsWith("/auth/");
  if (!isAuthPath) {
    const { useAuthStore } = await import("@/store/auth.store");
    const { isLoading, isAuthenticated } = useAuthStore.getState();
    const accessToken = getStoredAccessToken();
    if (isLoading || (!isAuthenticated && !accessToken)) {
      return {
        ok: false,
        payload: null,
        message: "AUTH_NOT_READY",
        status: 0,
      };
    }
    const { usePermissionsStore: PermissionStore } = await import("@/store/permissions.store");
    const { permissionsMe, loading: permissionsLoading } = PermissionStore.getState();
    if (isAuthenticated && accessToken && (permissionsLoading || !permissionsMe)) {
      return {
        ok: false,
        payload: null,
        message: "PERMISSIONS_NOT_READY",
        status: 0,
      };
    }
  }

  try {
    const payload = await httpRequest<any>(path, init);
    return { ok: true, payload, status: 200 };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        payload: error.payload,
        message: error.message || `HTTP ${error.status}`,
        status: error.status,
      };
    }
    return {
      ok: false,
      payload: null,
      message: error instanceof Error ? error.message : "Network request failed",
      status: 0,
    };
  }
}

type Filter = { op: "eq" | "in" | "gte" | "lte" | "gt" | "lt" | "neq"; column: string; value: unknown };
type SortSpec = { column: string; ascending: boolean };

class QueryBuilder implements PromiseLike<ApiResult<any>> {
  private action: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private sort: SortSpec | null = null;
  private maxRows: number | null = null;
  private payload: any = null;
  private expectSingle = false;
  private wantHead = false;
  private wantCount = false;

  constructor(private readonly table: string) {}

  select(_columns = "*", options?: { head?: boolean; count?: "exact" | null }) {
    if (this.action !== "insert" && this.action !== "update" && this.action !== "delete") {
      this.action = "select";
    }
    this.wantHead = options?.head ?? false;
    this.wantCount = options?.count === "exact";
    return this;
  }

  insert(payload: unknown) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ op: "in", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: "lte", column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ op: "gt", column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ op: "lt", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ op: "neq", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sort = { column, ascending: options?.ascending ?? false };
    return this;
  }

  limit(count: number) {
    this.maxRows = count;
    return this;
  }

  single() {
    this.expectSingle = true;
    return this;
  }

  private getEndpoint(): string {
    const endpoint = tableToEndpoint[this.table];
    if (!endpoint) {
      throw new Error(`No endpoint mapping for table: ${this.table}`);
    }
    return endpoint;
  }

  private applyClientFilters(rows: any[]): any[] {
    let filtered = rows;
    for (const filter of this.filters) {
      if (filter.op === "eq") {
        filtered = filtered.filter((row) => row?.[filter.column] === filter.value);
      }
      if (filter.op === "in") {
        const allowed = new Set(Array.isArray(filter.value) ? filter.value : []);
        filtered = filtered.filter((row) => allowed.has(row?.[filter.column]));
      }
      if (filter.op === "neq") {
        filtered = filtered.filter((row) => row?.[filter.column] !== filter.value);
      }
      if (filter.op === "gte") {
        filtered = filtered.filter((row) => row?.[filter.column] >= filter.value);
      }
      if (filter.op === "lte") {
        filtered = filtered.filter((row) => row?.[filter.column] <= filter.value);
      }
      if (filter.op === "gt") {
        filtered = filtered.filter((row) => row?.[filter.column] > filter.value);
      }
      if (filter.op === "lt") {
        filtered = filtered.filter((row) => row?.[filter.column] < filter.value);
      }
    }
    if (this.sort) {
      const { column, ascending } = this.sort;
      filtered = [...filtered].sort((a, b) => {
        const av = a?.[column];
        const bv = b?.[column];
        if (av == null && bv == null) return 0;
        if (av == null) return ascending ? -1 : 1;
        if (bv == null) return ascending ? 1 : -1;
        if (av < bv) return ascending ? -1 : 1;
        if (av > bv) return ascending ? 1 : -1;
        return 0;
      });
    }
    if (typeof this.maxRows === "number") {
      filtered = filtered.slice(0, this.maxRows);
    }
    return filtered;
  }

  private extractRows(payload: any): any[] {
    const data = payload?.data;
    if (Array.isArray(data)) return data;
    if (this.table === "notifications" && data && Array.isArray(data.notifications)) return data.notifications;
    if (Array.isArray(data?.rows)) return data.rows;
    return data ? [data] : [];
  }

  private async fetchLookup(endpoint: string): Promise<Record<string, any>> {
    const response = await apiFetch(`${endpoint}?page=1&limit=100`, { method: "GET" });
    if (!response.ok) return {};
    const rows = this.extractRows(response.payload).map((item) => toSnakeCase(item));
    return Object.fromEntries(rows.filter((row) => row?.id).map((row) => [row.id, row]));
  }

  private async enrichRows(rows: any[]): Promise<any[]> {
    if (!Array.isArray(rows) || rows.length === 0) {
      return rows;
    }

    if (this.table === "work_orders") {
      const assets = await this.fetchLookup("/assets");
      return rows.map((row) => ({ ...row, assets: row.asset_id ? assets[row.asset_id] ?? null : null }));
    }
    if (this.table === "pm_schedules") {
      const assets = await this.fetchLookup("/assets");
      return rows.map((row) => ({ ...row, assets: row.asset_id ? assets[row.asset_id] ?? null : null }));
    }
    if (this.table === "calibration_records") {
      const [assets, vendors] = await Promise.all([this.fetchLookup("/assets"), this.fetchLookup("/vendors")]);
      return rows.map((row) => ({
        ...row,
        assets: row.asset_id ? assets[row.asset_id] ?? null : null,
        vendors: row.vendor_id ? vendors[row.vendor_id] ?? null : null,
      }));
    }
    if (this.table === "amc_contracts") {
      const [assets, vendors] = await Promise.all([this.fetchLookup("/assets"), this.fetchLookup("/vendors")]);
      return rows.map((row) => ({
        ...row,
        assets: row.asset_id ? assets[row.asset_id] ?? null : null,
        vendors: row.vendor_id ? vendors[row.vendor_id] ?? null : null,
      }));
    }
    if (this.table === "gate_entries") {
      const gates = await this.fetchLookup("/gates");
      return rows.map((row) => ({
        ...row,
        gate: row.gate_id ? gates[row.gate_id] ?? null : null,
      }));
    }
    if (this.table === "log_entries") {
      const [templates, shifts] = await Promise.all([this.fetchLookup("/log-templates"), this.fetchLookup("/shifts")]);
      return rows.map((row) => ({
        ...row,
        log_templates: row.template_id ? templates[row.template_id] ?? null : null,
        shifts: row.shift_id ? shifts[row.shift_id] ?? null : null,
      }));
    }
    if (this.table === "log_entry_values") {
      const fields = await this.fetchLookup("/log-template-fields");
      return rows.map((row) => ({
        ...row,
        log_template_fields: row.field_id ? fields[row.field_id] ?? null : null,
      }));
    }
    if (this.table === "esg_metrics" || this.table === "safety_metrics") {
      const [templates, fields] = await Promise.all([this.fetchLookup("/log-templates"), this.fetchLookup("/log-template-fields")]);
      return rows.map((row) => ({
        ...row,
        log_templates: row.template_id ? templates[row.template_id] ?? null : null,
        log_template_fields: row.field_id ? fields[row.field_id] ?? null : null,
      }));
    }
    if (this.table === "vendor_notification_settings") {
      const vendors = await this.fetchLookup("/vendors");
      return rows.map((row) => ({ ...row, vendors: row.vendor_id ? vendors[row.vendor_id] ?? null : null }));
    }

    return rows;
  }

  private async executeSelect(): Promise<ApiResult<any>> {
    const endpoint = this.getEndpoint();
    const idFilter = this.filters.find((filter) => filter.op === "eq" && filter.column === "id");
    const templateFilter = this.filters.find((filter) => filter.op === "eq" && filter.column === "template_id");

    let path = endpoint;
    if (this.table === "log_template_fields" && templateFilter && typeof templateFilter.value === "string") {
      path = `/log-templates/${templateFilter.value}/fields`;
    } else if (idFilter && typeof idFilter.value === "string") {
      path = `${endpoint}/${idFilter.value}`;
    } else {
      const query = new URLSearchParams();
      query.set("page", "1");
      const requestedLimit = typeof this.maxRows === "number" ? this.maxRows : 100;
      const safeLimit = Math.min(Math.max(requestedLimit, 1), 1000);
      query.set("limit", String(safeLimit));
      const plantFilter = this.filters.find((filter) => filter.op === "eq" && filter.column === "plant_id");
      if (plantFilter && typeof plantFilter.value === "string") {
        query.set("plantId", plantFilter.value);
      }
      if (this.table === "email_report_logs") {
        const scheduleId = this.filters.find((filter) => filter.op === "eq" && filter.column === "schedule_id");
        if (scheduleId && typeof scheduleId.value === "string") {
          query.set("schedule_id", scheduleId.value);
        }
      }
      path = `${endpoint}?${query.toString()}`;
    }

    const response = await apiFetch(path, { method: "GET" });
    if (!response.ok) {
      if (response.status === 0 && (response.message === "AUTH_NOT_READY" || response.message === "PERMISSIONS_NOT_READY")) {
        if (this.wantHead) {
          return { data: null, error: null, count: 0 };
        }
        if (this.expectSingle) {
          return { data: null, error: null };
        }
        return { data: [], error: null, count: 0 };
      }
      return { data: null, error: { message: response.message, status: response.status }, count: null };
    }

    let rows = this.extractRows(response.payload).map((item) => toSnakeCase(item));
    rows = this.applyClientFilters(rows);
    rows = await this.enrichRows(rows);

    if (this.wantHead) {
      return { data: null, error: null, count: this.wantCount ? rows.length : null };
    }

    if (this.expectSingle) {
      return { data: rows[0] ?? null, error: rows.length ? null : { message: "No rows found" } };
    }
    return { data: rows, error: null, count: this.wantCount ? rows.length : null };
  }

  private async executeInsert(): Promise<ApiResult<any>> {
    const endpoint = this.getEndpoint();
    const body = toCamelCase(this.payload);

    if (this.table === "log_template_fields") {
      const templateId = body?.templateId ?? body?.template_id;
      if (!templateId) {
        return { data: null, error: { message: "template_id is required", status: 400 } };
      }
      const fieldBody = { ...body };
      delete fieldBody.templateId;
      delete fieldBody.template_id;
      const response = await apiFetch(`/log-templates/${templateId}/fields`, {
        method: "POST",
        body: JSON.stringify(fieldBody),
      });
      if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
      return { data: toSnakeCase(response.payload?.data), error: null };
    }

    const payloadArray = Array.isArray(body) ? body : [body];
    if (payloadArray.length > 1) {
      const created: any[] = [];
      for (const row of payloadArray) {
        const response = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(row) });
        if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
        created.push(toSnakeCase(response.payload?.data));
      }
      return { data: this.expectSingle ? created[0] ?? null : created, error: null };
    }

    const response = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payloadArray[0]) });
    if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
    const created = toSnakeCase(response.payload?.data);
    return { data: this.expectSingle ? created ?? null : created, error: null };
  }

  private async executeUpdate(): Promise<ApiResult<any>> {
    const endpoint = this.getEndpoint();
    const body = toCamelCase(this.payload);
    const idFilter = this.filters.find((filter) => filter.op === "eq" && filter.column === "id");

    if (idFilter && typeof idFilter.value === "string") {
      const response = await apiFetch(`${endpoint}/${idFilter.value}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
      return { data: toSnakeCase(response.payload?.data), error: null };
    }

    const existing = await this.executeSelect();
    if (existing.error || !Array.isArray(existing.data)) {
      return { data: null, error: existing.error ?? { message: "Failed to load rows for update", status: 500 } };
    }

    const updated: any[] = [];
    for (const row of existing.data) {
      if (!row?.id) continue;
      const response = await apiFetch(`${endpoint}/${row.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
      updated.push(toSnakeCase(response.payload?.data));
    }
    return { data: this.expectSingle ? updated[0] ?? null : updated, error: null };
  }

  private async executeDelete(): Promise<ApiResult<any>> {
    const endpoint = this.getEndpoint();
    const idFilter = this.filters.find((filter) => filter.op === "eq" && filter.column === "id");
    const userIdFilter = this.filters.find((filter) => filter.op === "eq" && filter.column === "user_id");

    if (this.table === "user_roles" && userIdFilter && typeof userIdFilter.value === "string") {
      const response = await apiFetch(`/user-roles/${userIdFilter.value}`, { method: "DELETE" });
      if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
      return { data: toSnakeCase(response.payload?.data), error: null };
    }

    if (idFilter && typeof idFilter.value === "string") {
      const response = await apiFetch(`${endpoint}/${idFilter.value}`, { method: "DELETE" });
      if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
      return { data: toSnakeCase(response.payload?.data), error: null };
    }

    const existing = await this.executeSelect();
    if (existing.error || !Array.isArray(existing.data)) {
      return { data: null, error: existing.error ?? { message: "Failed to load rows for delete", status: 500 } };
    }
    for (const row of existing.data) {
      if (!row?.id) continue;
      const response = await apiFetch(`${endpoint}/${row.id}`, { method: "DELETE" });
      if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
    }
    return { data: null, error: null };
  }

  async execute(): Promise<ApiResult<any>> {
    try {
      switch (this.action) {
        case "select":
          return await this.executeSelect();
        case "insert":
          return await this.executeInsert();
        case "update":
          return await this.executeUpdate();
        case "delete":
          return await this.executeDelete();
        default:
          return { data: null, error: { message: "Unsupported operation" } };
      }
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  then<TResult1 = ApiResult<any>, TResult2 = never>(
    onfulfilled?: ((value: ApiResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

type ChannelHandler = (payload: { new: unknown }) => void;

class NoopChannel {
  private insertHandler: ChannelHandler | null = null;
  on(_event: string, _config: unknown, handler: ChannelHandler) {
    this.insertHandler = handler;
    return this;
  }
  subscribe() {
    return { unsubscribe: () => undefined };
  }
}

export const dbClient = {
  from(table: string) {
    return new QueryBuilder(table);
  },
  channel(_name: string) {
    return new NoopChannel();
  },
  removeChannel(_channel: unknown) {
    return;
  },
  functions: {
    async invoke(name: string, options?: { body?: unknown }) {
      const body = toCamelCase(options?.body ?? {}) as Record<string, unknown>;

      if (name === "admin-create-user" && body.action === "delete_user" && typeof body.userId === "string") {
        const response = await apiFetch(`/users/${body.userId}`, { method: "DELETE" });
        if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
        return { data: toSnakeCase(response.payload?.data ?? response.payload), error: null };
      }

      if (name === "admin-create-user") {
        const payload = { ...body };
        if (!Array.isArray(payload.roles) && typeof payload.role === "string") {
          payload.roles = [payload.role === "SUPER_ADMIN" ? "SUPERADMIN" : payload.role];
        } else if (Array.isArray(payload.roles)) {
          payload.roles = payload.roles.map((role) => (role === "SUPER_ADMIN" ? "SUPERADMIN" : role));
        }
        const response = await apiFetch("/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
        return { data: toSnakeCase(response.payload?.data ?? response.payload), error: null };
      }

      if (name === "amc-vendor-notify") {
        const response = await apiFetch("/amc/notify-vendor", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!response.ok) return { data: null, error: { message: response.message, status: response.status } };
        return { data: toSnakeCase(response.payload?.data ?? response.payload), error: null };
      }

      if (name === "send-report-email") {
        const response = await apiFetch("/reports/send-now", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!response.ok) return { data: null, error: { message: response.message } };
        const data = response.payload?.data ?? response.payload;
        const normalized = {
          ...data,
          emails_sent: typeof data?.mail?.sent === "boolean" ? (data.mail.sent ? 1 : 0) : 0,
          notifications_created: 0,
        };
        return { data: toSnakeCase(normalized), error: null };
      }

      {
        return { data: null, error: { message: `Unsupported function invoke: ${name}`, status: 400 } };
      }
    },
  },
};
