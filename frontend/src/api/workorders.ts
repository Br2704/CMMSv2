import { httpRequest } from '@/api/http';

export type WorkOrder = Record<string, unknown>;
export interface WorkOrderListResponse {
  success: true;
  data: WorkOrder[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const buildQuery = (query: Record<string, string | number | undefined> = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => v !== undefined && params.set(k, String(v)));
  return params.toString() ? `?${params.toString()}` : '';
};

export const listWorkOrders = (query?: Record<string, string | number | undefined>) =>
  httpRequest<WorkOrderListResponse>(`/work-orders${buildQuery(query)}`, { method: 'GET' });
export const getWorkOrder = (id: string) => httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}`, { method: 'GET' });
export const createWorkOrder = (payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: WorkOrder }>('/work-orders', { method: 'POST', body: JSON.stringify(payload) });
export const updateWorkOrder = (id: string, payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteWorkOrder = (id: string) =>
  httpRequest<{ success: true; data: { id: string; deleted: boolean } }>(`/work-orders/${id}`, { method: 'DELETE' });
