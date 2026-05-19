import { httpRequest } from '@/api/http';

export type WorkOrder = Record<string, any>;
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
      team: number;
      all: number;
      approvalRequired: number;
    };
    kpis: {
      open: number;
      closedLast24h: number;
      pendingApproval: number;
      total: number;
      escalated?: number;
    };
    defaultScope: "assigned" | "raised" | "incharge" | "team" | "all" | "approval_required";
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

export const acceptWorkOrder = (id: string, payload: Record<string, unknown> = {}) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}/accept`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const addWorkOrderActivity = (id: string, payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}/activity`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const triageWorkOrder = (id: string, payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}/triage`, {
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

export const bulkUpdateWorkOrders = (ids: string[], payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: { updated: number } }>('/work-orders/bulk-update', {
    method: 'POST',
    body: JSON.stringify({ ids, ...payload }),
  });

export async function exportWorkOrdersCSV(query: Record<string, string | number | undefined> = {}): Promise<void> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => v !== undefined && params.set(k, String(v)));
  const qs = params.toString();
  const response = await fetch(`/api/work-orders/export${qs ? '?' + qs : ''}`, {
    credentials: 'include',
    headers: { 'Accept': 'text/csv' },
  });
  if (!response.ok) throw new Error('Export failed');
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `work-orders-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export const rejectWorkOrder = (id: string, payload: { comments: string }) =>
  httpRequest<{ success: true; data: WorkOrder }>(`/work-orders/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

