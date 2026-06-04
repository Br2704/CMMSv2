import { httpRequest } from './http';
import type { ApiResponse } from './types';

export interface FailureCode {
  id: string;
  plantId: string;
  departmentId: string | null;
  moduleId: string | null;
  assetId: string | null;
  category: string;
  code: string;
  description: string | null;
  isActive: boolean;
}

export async function getFailureCodes(params?: { plantId?: string; assetId?: string; category?: string }): Promise<ApiResponse<FailureCode[]>> {
  const query = new URLSearchParams();
  if (params?.plantId) query.set('plantId', params.plantId);
  if (params?.assetId) query.set('assetId', params.assetId);
  if (params?.category) query.set('category', params.category);
  return httpRequest<ApiResponse<FailureCode[]>>(`/failure-codes?${query.toString()}`, { method: 'GET' });
}
