export interface ListParams {
  plantId?: string;
  departmentId?: string;
  moduleId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  includeInactive?: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiListResponse<T> extends ApiResponse<T[]> {
  pagination?: Pagination;
  meta?: {
    pagination?: Pagination;
  } & Record<string, unknown>;
}

export interface DeleteResult {
  id: string;
  deleted: boolean;
}

export function toQueryString(params: ListParams = {}): string {
  const searchParams = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined || rawValue === null) continue;
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (!trimmed) continue;
      searchParams.set(key, trimmed);
      continue;
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      searchParams.set(key, String(rawValue));
      continue;
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}
