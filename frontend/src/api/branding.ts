import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface BrandingMe {
  organizationId: string | null;
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationLogoAssetUrl?: string | null;
  organizationFaviconUrl: string | null;
  sidebarTitle: string;
  browserTitle: string;
  brandColor?: string | null;
  fallbackLogoUrl: string;
  fallbackFaviconUrl: string;
  updatedAt: string | null;
}

export function getBrandingMe() {
  return httpRequest<ApiResponse<BrandingMe>>("/branding/me", { method: "GET" });
}

export interface BrandingVersionResponse {
  version: number;
  updatedAt: string;
}

export function getBrandingVersion() {
  return httpRequest<ApiResponse<BrandingVersionResponse>>("/branding/version", { method: "GET" });
}

export interface BrandingManifest {
  id?: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose?: string;
  }>;
}

export function getBrandingManifest() {
  return httpRequest<BrandingManifest>("/branding/manifest", { method: "GET" });
}

export function buildBrandingManifestUrl(organizationId?: string | null, version?: number | null) {
  const params = new URLSearchParams();
  if (organizationId) params.set("organizationId", organizationId);
  if (version) params.set("v", String(version));
  const query = params.toString();
  return query ? `/api/branding/manifest?${query}` : "/api/branding/manifest";
}

export function buildBrandingLogoUrl(organizationId?: string | null, version?: number | null, size = 192) {
  const params = new URLSearchParams();
  if (organizationId) params.set("organizationId", organizationId);
  params.set("size", size >= 512 ? "512" : "192");
  if (version) params.set("v", String(version));
  return `/api/branding/logo?${params.toString()}`;
}

export function buildBrandingLogoUrlByCode(organizationCode: string, version?: number | null, size = 192) {
  const params = new URLSearchParams();
  params.set("organizationCode", organizationCode);
  params.set("size", size >= 512 ? "512" : "192");
  if (version) params.set("v", String(version));
  return `/api/branding/logo?${params.toString()}`;
}

export function buildBrandingFaviconUrlByCode(organizationCode: string, version?: number | null, size = 192) {
  const params = new URLSearchParams();
  params.set("organizationCode", organizationCode);
  params.set("size", size >= 512 ? "512" : "192");
  if (version) params.set("v", String(version));
  return `/api/branding/favicon?${params.toString()}`;
}
