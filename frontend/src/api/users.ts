import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface UserProfile {
  id: string;
  userId: string;
  userCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  profileImageUrl?: string | null;
  department: string | null;
  plantId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles?: string[];
}

export interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  userCode: string;
  department?: string | null;
  plantId?: string | null;
  isActive?: boolean;
  roles: string[];
}

export interface PatchUserPayload {
  email?: string;
  fullName?: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  department?: string | null;
  plantId?: string | null;
  isActive?: boolean;
  password?: string;
}

export interface PatchProfilePayload {
  userCode?: string;
  fullName?: string;
  email?: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  department?: string | null;
  plantId?: string | null;
  isActive?: boolean;
}

export function listUsers(params: ListParams = {}) {
  return httpRequest<ApiListResponse<UserProfile>>(`/users${toQueryString(params)}`, { method: "GET" });
}

export function listProfiles(params: ListParams = {}) {
  return httpRequest<ApiListResponse<UserProfile>>(`/profiles${toQueryString(params)}`, { method: "GET" });
}

export function getUser(id: string) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/users/${id}`, { method: "GET" });
}

export function createUser(payload: CreateUserPayload) {
  return httpRequest<ApiResponse<Record<string, unknown>>>("/users", { method: "POST", body: JSON.stringify(payload) });
}

export function updateUser(id: string, payload: PatchUserPayload) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function updateProfile(id: string, payload: PatchProfilePayload) {
  return httpRequest<ApiResponse<UserProfile>>(`/profiles/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function updateUserRoles(id: string, payload: { roles: string[]; plantId?: string | null }) {
  return httpRequest<ApiResponse<{ userId: string; roles: string[] }>>(`/users/${id}/roles`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteUser(id: string) {
  return httpRequest<ApiResponse<DeleteResult | { userId: string }>>(`/users/${id}`, { method: "DELETE" });
}
