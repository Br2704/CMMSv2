import { httpRequest } from './http';
import type { ApiResponse } from './types';

export interface RcaSubmitPayload {
  woId: string;
  assetId: string;
  problemStatement: string;
  why1: string;
  why2?: string | null;
  why3?: string | null;
  why4?: string | null;
  why5?: string | null;
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
  evidenceUrls?: string[] | null;
}

export async function submitRca(data: RcaSubmitPayload): Promise<ApiResponse<any>> {
  return httpRequest<ApiResponse<any>>('/rcas', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
