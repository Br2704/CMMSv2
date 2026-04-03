import { httpRequest } from "@/api/http";
import type { ApiListResponse, ApiResponse, DeleteResult, ListParams } from "@/api/types";
import { toQueryString } from "@/api/types";

export interface Vendor {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstNumber: string | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorPayload {
  code: string;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  category?: string | null;
  isActive?: boolean;
}

export interface VendorNotificationSetting {
  id: string;
  vendorId: string;
  notifyEmail: boolean;
  notifyInApp: boolean;
  notifyBeforeDays: number[];
  notifyOnRenewalDue: boolean;
  contactEmails: string[];
  plantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorNotificationPayload {
  vendorId: string;
  notifyEmail?: boolean;
  notifyInApp?: boolean;
  notifyBeforeDays?: number[];
  notifyOnRenewalDue?: boolean;
  contactEmails?: string[];
  plantId?: string | null;
}

export function listVendors(params: ListParams = {}) {
  return httpRequest<ApiListResponse<Vendor>>(`/vendors${toQueryString(params)}`, { method: "GET" });
}
export function createVendor(payload: VendorPayload) {
  return httpRequest<ApiResponse<Vendor>>("/vendors", { method: "POST", body: JSON.stringify(payload) });
}
export function updateVendor(id: string, payload: Partial<VendorPayload>) {
  return httpRequest<ApiResponse<Vendor>>(`/vendors/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteVendor(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/vendors/${id}`, { method: "DELETE" });
}

export function listVendorNotificationSettings(params: ListParams = {}) {
  return httpRequest<ApiListResponse<VendorNotificationSetting>>(`/vendor-notification-settings${toQueryString(params)}`, {
    method: "GET",
  });
}
export function createVendorNotificationSetting(payload: VendorNotificationPayload) {
  return httpRequest<ApiResponse<VendorNotificationSetting>>("/vendor-notification-settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateVendorNotificationSetting(id: string, payload: Partial<VendorNotificationPayload>) {
  return httpRequest<ApiResponse<VendorNotificationSetting>>(`/vendor-notification-settings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
export function deleteVendorNotificationSetting(id: string) {
  return httpRequest<ApiResponse<DeleteResult>>(`/vendor-notification-settings/${id}`, {
    method: "DELETE",
  });
}

export const notifyVendorRenewal = (payload: { to: string[]; subject: string; message: string }) =>
  httpRequest<ApiResponse<{ sent?: boolean }>>("/vendors/notify-renewals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
