import { httpRequest } from '@/api/http';

export interface MachineFailureCodeMapping {
  id: string;
  machineId: string;
  failureCategory: string;
  failureCode: string;
  status: string;
  requestedBy: string | null;
  approvedBy: string | null;
  machine?: any;
  requester?: any;
  approver?: any;
  createdAt: string;
  updatedAt: string;
}

const buildQuery = (query: Record<string, any> = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => v !== undefined && params.set(k, String(v)));
  return params.toString() ? `?${params.toString()}` : '';
};

export const listMachineFailureCodes = async (params?: Record<string, any>) => {
  return httpRequest<{ success: true; data: MachineFailureCodeMapping[] }>(`/machine-failure-codes${buildQuery(params)}`, { method: 'GET' });
};

export const createMachineFailureCode = async (data: { machineId: string; failureCategory: string; failureCode: string }) => {
  return httpRequest<{ success: true; data: MachineFailureCodeMapping }>('/machine-failure-codes', { method: 'POST', body: JSON.stringify(data) });
};

export const approveMachineFailureCode = async (id: string) => {
  return httpRequest<{ success: true; data: MachineFailureCodeMapping }>(`/machine-failure-codes/${id}/approve`, { method: 'POST' });
};

export const rejectMachineFailureCode = async (id: string) => {
  return httpRequest<{ success: true; data: MachineFailureCodeMapping }>(`/machine-failure-codes/${id}/reject`, { method: 'POST' });
};

export const deleteMachineFailureCode = async (id: string) => {
  return httpRequest<{ success: true; data: { id: string; deleted: boolean } }>(`/machine-failure-codes/${id}`, { method: 'DELETE' });
};
