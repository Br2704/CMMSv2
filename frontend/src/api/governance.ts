import { httpRequest } from './http';
import { ApiResponse, PaginatedResponse, PaginationQuery } from './types';

const httpClient = {
  get: <T>(url: string, config?: { params?: any }) => {
    const qs = config?.params ? '?' + new URLSearchParams(config.params).toString() : '';
    return httpRequest<T>(url + qs, { method: 'GET' });
  },
  post: <T>(url: string, body?: any) => {
    return httpRequest<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }
};

export interface ChangeRequest {
  id: string;
  moduleType: string;
  actionType: string;
  referenceId: string | null;
  payload: any;
  status: string;
  comments: string | null;
  submittedBy: { id: string; fullName: string } | null;
  level1Approver: { id: string; fullName: string } | null;
  level2Approver: { id: string; fullName: string } | null;
  level1ApprovedAt: string | null;
  level2ApprovedAt: string | null;
  createdAt: string;
}

export interface RecordRevision {
  id: string;
  moduleType: string;
  referenceId: string;
  versionNumber: number;
  payload: any;
  changedBy: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface PendingExecution {
  id: string;
  executionType: string;
  referenceId: string | null;
  payload: any;
  status: string;
  comments: string | null;
  submittedBy: { id: string; fullName: string } | null;
  level1Approver: { id: string; fullName: string } | null;
  level2Approver: { id: string; fullName: string } | null;
  level1ApprovedAt: string | null;
  level2ApprovedAt: string | null;
  createdAt: string;
}

export interface ApprovalsQuery extends PaginationQuery {
  status?: string;
  moduleType?: string;
  executionType?: string;
}

export const governanceApi = {
  getApprovals: (query: ApprovalsQuery) =>
    httpClient.get<PaginatedResponse<ChangeRequest>>('/governance/approvals', { params: query }),

  approveRequest: (id: string, comments?: string) =>
    httpClient.post<ApiResponse<ChangeRequest>>(`/governance/approvals/${id}/approve`, { comments }),

  rejectRequest: (id: string, comments: string) =>
    httpClient.post<ApiResponse<ChangeRequest>>(`/governance/approvals/${id}/reject`, { comments }),

  getExecutionApprovals: (query: ApprovalsQuery) =>
    httpClient.get<PaginatedResponse<PendingExecution>>('/governance/executions', { params: query }),

  approveExecution: (id: string, comments?: string) =>
    httpClient.post<ApiResponse<PendingExecution>>(`/governance/executions/${id}/approve`, { comments }),

  rejectExecution: (id: string, comments: string) =>
    httpClient.post<ApiResponse<PendingExecution>>(`/governance/executions/${id}/reject`, { comments }),

  getRevisions: (moduleType: string, referenceId: string) =>
    httpClient.get<ApiResponse<RecordRevision[]>>(`/governance/revisions/${moduleType}/${referenceId}`),

  rollbackRevision: (revisionId: string) =>
    httpClient.post<ApiResponse<ChangeRequest>>(`/governance/revisions/${revisionId}/rollback`),
};

export interface GovernanceOverviewResponse {
  organizationsCount: number;
  plantsCount: number;
  usersCount: number;
  recentlyCreatedOrganizations: any[];
  recentlyCreatedPlants: any[];
  subscriptionStatusCounts: any;
}

export const getGovernanceOverview = () =>
  httpClient.get<ApiResponse<GovernanceOverviewResponse>>('/governance/overview');
