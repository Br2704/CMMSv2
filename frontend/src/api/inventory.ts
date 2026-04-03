import { httpRequest } from "@/api/http";
import type { ListParams } from "@/api/types";

export interface SpareItem {
  id: string;
  code: string;
  name: string;
  category: string | null;
  currentStock: number;
  minLevel: number;
  reorderLevel: number;
  unit: string;
  location: string | null;
  assetId: string | null;
  plantId: string | null;
  isCritical: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpareUsageItem extends Record<string, unknown> {
  spareItemId: string;
  quantity: number;
  spareName: string | null;
  spareCode: string | null;
}
export type StockRequest = Record<string, unknown>;

export interface SpareItemPayload {
  code: string;
  name: string;
  category?: string | null;
  currentStock?: number;
  minLevel?: number;
  reorderLevel?: number;
  unit?: string;
  location?: string | null;
  assetId?: string | null;
  plantId?: string | null;
  isCritical?: boolean;
  isActive?: boolean;
}

export interface SpareItemListParams extends ListParams {
  assetId?: string;
  isCritical?: boolean;
}

function toInventoryQueryString(params: SpareItemListParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.plantId) searchParams.set("plantId", params.plantId);
  if (params.departmentId) searchParams.set("departmentId", params.departmentId);
  if (params.moduleId) searchParams.set("moduleId", params.moduleId);
  if (params.assetId) searchParams.set("assetId", params.assetId);
  if (params.search) searchParams.set("search", params.search);
  if (typeof params.page === "number") searchParams.set("page", String(params.page));
  if (typeof params.limit === "number") searchParams.set("limit", String(params.limit));
  if (params.sort) searchParams.set("sort", params.sort);
  if (typeof params.includeInactive === "boolean") searchParams.set("includeInactive", String(params.includeInactive));
  if (typeof params.isCritical === "boolean") searchParams.set("isCritical", String(params.isCritical));

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export const listSpareItems = (params: SpareItemListParams = {}) =>
  httpRequest<{ success: true; data: SpareItem[]; pagination: unknown }>(`/inventory${toInventoryQueryString(params)}`, { method: "GET" });
export const createSpareItem = (payload: SpareItemPayload) =>
  httpRequest<{ success: true; data: SpareItem }>("/inventory", { method: "POST", body: JSON.stringify(payload) });
export const updateSpareItem = (id: string, payload: Partial<SpareItemPayload>) =>
  httpRequest<{ success: true; data: SpareItem }>(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const deleteSpareItem = (id: string) =>
  httpRequest<{ success: true; data: { id: string; deleted: boolean } }>(`/inventory/${id}`, { method: "DELETE" });

export const listStockRequests = (query = "") =>
  httpRequest<{ success: true; data: StockRequest[]; pagination: unknown }>(`/stock-requests${query}`, { method: "GET" });
export const createStockRequest = (payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: StockRequest }>("/stock-requests", { method: "POST", body: JSON.stringify(payload) });
export const updateStockRequest = (id: string, payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: StockRequest }>(`/stock-requests/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
