import { httpRequest } from '@/api/http';

export type WorkOrder = Record<string, unknown>;
export interface WorkOrderListResponse {
  success: true;
  data: WorkOrder[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface WorkOrderSummaryResponse {
  success: true;
  data: {
    tabs: {
      assigned: number;
      raised: number;
      incharge: number;
      all: number;
      approvalRequired: number;
    };
    kpis: {
      open: number;
      closedLast24h: number;
      pendingApproval: number;
      total: number;
    };
    defaultScope: "assigned" | "incharge" | "all";
  };
}

const buildQuery = (query: Record<string, string | number | undefined> = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => v !== undefined && params.set(k, String(v)));
  return params.toString() ? `?${params.toString()}` : '';
};

export const listWorkOrders = (query?: Record<string, string | number | undefined>) =>
  httpRequest<WorkOrderListResponse>(`/work-orders${buildQuery(query)}`, { method: 'GET' });
export const getWorkOrderSummary = (query?: Record<string, string | number | undefined>) =>
  httpRequest<WorkOrderSummaryResponse>(`/work-orders/summary${buildQuery(query)}`, { method: 'GET' });
export const listWorkOrderActivity = (id: string, query?: Record<string, string | number | undefined>) =>
  httpRequest<WorkOrderListResponse>(`/work-orders/${id}/activity${buildQuery(query)}`, { method: 'GET' });
export const getWorkOrder = (id: string) => httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}`, { method: 'GET' });
export const createWorkOrder = (payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: WorkOrder }>('/work-orders', { method: 'POST', body: JSON.stringify(payload) });
export const updateWorkOrder = (id: string, payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteWorkOrder = (id: string) =>
  httpRequest<{ success: true; data: { id: string; deleted: boolean } }>(`/work-orders/${id}`, { method: 'DELETE' });

export const startWorkOrder = (id: string, payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}/start`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const submitWorkOrderForApproval = (id: string, payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}/submit-for-approval`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const approveWorkOrder = (id: string, payload: { comments?: string | null } = {}) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const rejectWorkOrder = (id: string, payload: { comments: string }) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
