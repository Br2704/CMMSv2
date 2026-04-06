import { httpRequest } from "@/api/http";
import type { ApiResponse } from "@/api/types";

export interface AssetQrData {
  assetId: string;
  assetCode?: string;
  assetName?: string;
  qrCodeId: string | null;
  qrToken: string;
  qrPayload: string;
  publicResolverUrl: string;
  appScanUrl?: string;
  machineCardUrl?: string;
  generatedAt: string;
  rotatedAt: string | null;
}

export interface QrResolvedAsset {
  id: string;
  code: string;
  name: string;
  assetType: string;
  qrCodeId: string | null;
  status?: string | null;
  location?: string | null;
  machineImageUrl?: string | null;
  reliability?: {
    mttrMinutes?: string | number | null;
    mtbfMinutes?: string | number | null;
    downtimeMinutes?: string | number | null;
    windowEnd?: string | null;
  } | null;
}

export interface QrResolvedHierarchy {
  plant: { id: string; code?: string | null; name: string | null } | null;
  department: { id: string; code?: string | null; name: string | null } | null;
  module: { id: string; code?: string | null; name: string | null } | null;
}

export interface QrResolvedLinks {
  publicResolverUrl: string;
  appScanUrl: string;
  machineCardUrl: string;
}

export interface QrResolveData {
  token: string;
  asset: QrResolvedAsset;
  hierarchy: QrResolvedHierarchy;
  links?: QrResolvedLinks;
}

function withOptionalToken(path: string, token?: string) {
  if (!token) return path;
  return `${path}?token=${encodeURIComponent(token)}`;
}

export function getAssetQr(assetId: string) {
  return httpRequest<ApiResponse<AssetQrData>>(`/assets/${assetId}/qr`, {
    method: "GET",
  });
}

export function rotateAssetQr(assetId: string) {
  return httpRequest<ApiResponse<AssetQrData>>(`/assets/${assetId}/qr/rotate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function resolveQrToken(token: string) {
  return httpRequest<ApiResponse<QrResolveData>>(`/qr/resolve/${encodeURIComponent(token)}`, {
    method: "GET",
  });
}

export function resolveQrMachineCode(machineCode: string, token?: string) {
  return httpRequest<ApiResponse<QrResolveData>>(withOptionalToken(`/qr/resolve-by-code/${encodeURIComponent(machineCode)}`, token), {
    method: "GET",
  });
}

export function resolvePublicQrToken(token: string) {
  return httpRequest<ApiResponse<QrResolveData>>(`/qr/public/${encodeURIComponent(token)}`, {
    method: "GET",
  });
}

export function resolvePublicMachineCode(machineCode: string, token?: string) {
  return httpRequest<ApiResponse<QrResolveData>>(withOptionalToken(`/qr/public/machine/${encodeURIComponent(machineCode)}`, token), {
    method: "GET",
  });
}
