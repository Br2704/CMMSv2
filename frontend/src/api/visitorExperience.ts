import { getApiBaseUrl, httpRequest } from '@/api/http';
import type { ApiListResponse, ApiResponse, Pagination } from '@/api/types';

function buildQuery(params: Record<string, string | number | boolean | undefined | null> = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '') return;
    searchParams.set(key, String(normalized));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export interface ApiResponseWithPagination<T> extends ApiResponse<T> {
  pagination?: Pagination;
}

export interface VisitorExperienceProduct {
  id?: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  plantIds?: string[];
  departmentIds?: string[];
  linkedDepartments?: Array<{
    id: string;
    code: string;
    name: string;
    plantId: string | null;
  }>;
}

export interface VisitorExperienceContent {
  id: string | null;
  plantId: string | null;
  pageTitle: string;
  companyOverview: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  heroHighlights: Array<Record<string, unknown>>;
  products: VisitorExperienceProduct[];
  experienceMeta?: VisitorExperienceMeta;
  certifications?: string[];
  esgInitiatives?: string[];
  plantCapabilities?: string[];
  introVideoUrl?: string | null;
  galleryImages?: string[];
  whyVisitHighlights?: string[];
  safetyInstructions?: string[];
  ppeRequirements?: string[];
  restrictedZonesWarning?: string | null;
  emergencyContacts?: VisitorEmergencyContact[];
  evacuationRoutes?: VisitorEvacuationRoute[];
  updatedAt?: string | null;
}

export interface VisitorEmergencyContact {
  name: string;
  role: string | null;
  phone: string;
}

export interface VisitorEvacuationRoute {
  id: string;
  label: string;
  description: string | null;
}

export interface VisitorExperienceMeta {
  certifications: string[];
  esgInitiatives: string[];
  plantCapabilities: string[];
  introVideoUrl: string | null;
  galleryImages: string[];
  whyVisitHighlights: string[];
  safetyInstructions: string[];
  ppeRequirements: string[];
  restrictedZonesWarning: string | null;
  emergencyContacts: VisitorEmergencyContact[];
  evacuationRoutes: VisitorEvacuationRoute[];
}

export interface VisitorProfileResponse {
  plantId: string | null;
  pageTitle: string;
  companyOverview: string;
  heroHighlights: Array<Record<string, unknown>>;
  products: VisitorExperienceProduct[];
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  certifications: string[];
  esgInitiatives: string[];
  plantCapabilities: string[];
  introVideoUrl: string | null;
  galleryImages: string[];
  whyVisitHighlights: string[];
  safetyInstructions: string[];
  ppeRequirements: string[];
  restrictedZonesWarning: string | null;
  emergencyContacts: VisitorEmergencyContact[];
  evacuationRoutes: VisitorEvacuationRoute[];
  latestSafetyConsent: {
    id: string;
    consentGiven: boolean;
    consentedAt: string;
    gateEntryId: string | null;
  } | null;
}

export interface VisitorSafetyConsentPayload {
  plantId?: string | null;
  gateEntryId?: string | null;
  consentGiven?: boolean;
  deviceInfo?: string | null;
}

export interface VisitorSafetyConsentRecord {
  id: string;
  visitorId: string;
  consentGiven: boolean;
  timestamp: string;
  ipAddress: string | null;
  gateEntryId: string | null;
  plantId: string | null;
}

export interface PlantLayoutNode {
  id: string;
  label: string;
  nodeType: string;
  refId?: string | null;
  x?: number;
  y?: number;
  latitude?: number;
  longitude?: number;
}

export interface PlantLayoutEdge {
  fromNodeId: string;
  toNodeId: string;
  distance?: number;
  directional?: boolean;
}

export interface PlantLayout {
  id: string | null;
  plantId: string;
  layoutName: string;
  version: number;
  svgMarkup: string | null;
  mapData: {
    nodes: PlantLayoutNode[];
    edges: PlantLayoutEdge[];
  };
  isGenerated: boolean;
  updatedAt?: string;
  hierarchy: {
    departments: Array<{ id: string; code: string; name: string }>;
    modules: Array<{ id: string; code: string | null; name: string; departmentId: string | null }>;
  };
}

export interface VisitorRequestRecord {
  id: string;
  gateId: string;
  plantId: string | null;
  departmentId: string | null;
  moduleId: string | null;
  visitorName: string;
  visitorCompany: string | null;
  visitorPhone: string | null;
  visitorType: string;
  purpose: string | null;
  personToMeet: string | null;
  personToMeetUserId: string | null;
  desiredVisitAt: string | null;
  approvalStatus: string;
  approvalRequestedAt: string | null;
  approvalRespondedAt: string | null;
  approvalComments: string | null;
  navigationEnabled: boolean;
  navigationEnabledAt: string | null;
  status: string;
  currentLocationNodeId: string | null;
  currentLocationLabel: string | null;
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
  plant?: { id: string; plantName?: string | null; plantCode?: string | null } | null;
  gate?: { id: string; gateName?: string | null; gateCode?: string | null } | null;
  department?: { id: string; name: string; code?: string | null } | null;
  module?: { id: string; name: string; code?: string | null } | null;
  personToMeetUser?: { id: string; fullName?: string | null; email?: string | null } | null;
  recordedByUser?: { id: string; fullName?: string | null; email?: string | null } | null;
  approvalByUser?: { id: string; fullName?: string | null; email?: string | null } | null;
}

export interface VisitorNavigationRoute {
  gateEntryId: string;
  approvalStatus: string;
  sourceNode: PlantLayoutNode | null;
  destinationNode: PlantLayoutNode | null;
  pathNodes: PlantLayoutNode[];
  instructions: string[];
  svgMarkup: string | null;
  mapData: {
    nodes: PlantLayoutNode[];
    edges: PlantLayoutEdge[];
  };
}

export interface VisitorPassData {
  gateEntryId: string;
  sessionId: string;
  sessionToken: string;
  visitor: {
    name: string;
    company: string | null;
    phone: string | null;
    purpose: string | null;
  };
  host: {
    userId: string | null;
    name: string | null;
  };
  location: {
    gate: string | null;
    department: string | null;
    module: string | null;
    meetingNodeId: string | null;
    meetingNodeLabel: string | null;
  };
  validity: {
    status: 'VALID' | 'EXPIRED' | 'PENDING';
    approved: boolean;
    validFrom: string;
    validTo: string;
    remainingSeconds: number;
  };
  qrPayload: Record<string, unknown>;
  gateScanValidation: {
    allowed: boolean;
    reason: string | null;
  };
  safetyConsent: {
    consentGiven: boolean;
    consentedAt: string;
  } | null;
}

export interface VisitorTrackingPoint {
  id: string;
  visitorSessionId: string;
  gateEntryId: string;
  plantId: string | null;
  latitude: string | null;
  longitude: string | null;
  nodeId: string | null;
  nodeLabel: string | null;
  geoFenceStatus: string;
  alertType: string | null;
  routeDeviation: boolean;
  source: string;
  trackedAt: string;
  createdAt: string;
}

export interface VisitorTrackingResponse {
  sessionId: string;
  gateEntryId: string;
  path: VisitorTrackingPoint[];
  latest: VisitorTrackingPoint | null;
}

export interface VisitorInsights {
  pendingApprovals: number;
  approvedToday: number;
  rejectedToday: number;
  activeVisitors: number;
  navigationEnabled: number;
  requestsToday: number;
  liveTracked: number;
  visitorsPerEmployee: Array<{
    userId: string;
    employeeName: string;
    total: number;
  }>;
}

export interface VisitorRequestPayload {
  gateId?: string | null;
  plantId: string;
  departmentId?: string | null;
  moduleId?: string | null;
  personToMeetUserId: string;
  visitorName: string;
  visitorCompany?: string | null;
  visitorPhone?: string | null;
  purpose: string;
  desiredVisitAt?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  vehicleNumber?: string | null;
  remarks?: string | null;
}

export function getVisitorExperienceContent(plantId?: string) {
  return httpRequest<ApiResponse<VisitorExperienceContent>>(`/visitor-experience/content${buildQuery({ plantId })}`, { method: 'GET' });
}

export function getVisitorProfile(plantId?: string) {
  return httpRequest<ApiResponse<VisitorProfileResponse>>(`/visitor/profile${buildQuery({ plantId })}`, { method: 'GET' });
}

export function logVisitorSafetyConsent(payload: VisitorSafetyConsentPayload) {
  return httpRequest<ApiResponse<VisitorSafetyConsentRecord>>('/visitor/consent', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveVisitorExperienceContent(payload: {
  plantId?: string | null;
  pageTitle: string;
  companyOverview?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  heroHighlights?: Array<Record<string, unknown>>;
  products?: VisitorExperienceProduct[];
  isActive?: boolean;
}) {
  return httpRequest<ApiResponse<VisitorExperienceContent>>('/visitor-experience/content', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getPlantVisitorLayout(plantId: string) {
  return httpRequest<ApiResponse<PlantLayout>>(`/visitor-experience/layout${buildQuery({ plantId })}`, { method: 'GET' });
}

export function savePlantVisitorLayout(payload: {
  plantId: string;
  layoutName: string;
  svgMarkup?: string | null;
  mapData?: { nodes: PlantLayoutNode[]; edges: PlantLayoutEdge[] } | null;
  isActive?: boolean;
  publishNow?: boolean;
}) {
  return httpRequest<ApiResponse<PlantLayout>>('/visitor-experience/layout', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function createVisitorRequest(payload: VisitorRequestPayload) {
  return httpRequest<ApiResponse<VisitorRequestRecord>>('/visitor-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listVisitorRequests(params: {
  plantId?: string;
  scope?: 'my-requests' | 'approvals' | 'all';
  approvalStatus?: string;
  status?: string;
  personToMeetUserId?: string;
  search?: string;
  page?: number;
  limit?: number;
} = {}) {
  return httpRequest<ApiListResponse<VisitorRequestRecord>>(`/visitor-requests${buildQuery(params)}`, { method: 'GET' });
}

export function reviewVisitorRequest(id: string, payload: { action: 'APPROVE' | 'REJECT'; comments?: string | null }) {
  return httpRequest<ApiResponse<VisitorRequestRecord>>(`/visitor-requests/${id}/approval`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function addVisitorNavigationCheckIn(
  id: string,
  payload: {
    nodeId?: string | null;
    nodeLabel?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    checkInMode?: 'MANUAL' | 'GPS' | 'CHECKPOINT';
  },
) {
  return httpRequest<ApiResponse<Record<string, unknown>>>(`/visitor-requests/${id}/navigation-checkins`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getVisitorNavigationRoute(id: string, params: { fromNodeId?: string; toNodeId?: string } = {}) {
  return httpRequest<ApiResponse<VisitorNavigationRoute>>(`/visitor-requests/${id}/navigation${buildQuery(params)}`, {
    method: 'GET',
  });
}

export function getVisitorNavigation(params: { gateEntryId?: string; sessionToken?: string; sessionId?: string; fromNodeId?: string; toNodeId?: string } = {}) {
  return httpRequest<ApiResponse<VisitorNavigationRoute>>(`/visitor/navigation${buildQuery(params)}`, {
    method: 'GET',
  });
}

export function getVisitorInsights(params: { plantId?: string } = {}) {
  return httpRequest<ApiResponse<VisitorInsights>>(`/gate-dashboard/visitor-insights${buildQuery(params)}`, {
    method: 'GET',
  });
}

export interface SmartPlantCoordinate {
  id: string;
  plantId: string;
  gateId: string | null;
  departmentId: string | null;
  moduleId: string | null;
  locationName: string;
  locationType: 'GATE' | 'DEPARTMENT' | 'MODULE' | 'KEY_LOCATION' | 'BUILDING';
  latitude: string;
  longitude: string;
  boundaryPoints: Array<{ latitude: number; longitude: number }> | null;
  meta: Record<string, unknown> | null;
  isActive: boolean;
}

export interface SmartPathway {
  id: string;
  plantId: string;
  pathwayName: string;
  pathType: 'WALKABLE' | 'RESTRICTED' | 'SERVICE' | 'EMERGENCY';
  startCoordinateId: string | null;
  endCoordinateId: string | null;
  cornerPoints: Array<{ latitude: number; longitude: number }> | null;
  routeMeta: Record<string, unknown> | null;
  isActive: boolean;
}

export interface SmartGeoFence {
  id: string;
  plantId: string;
  fenceName: string;
  fenceType: 'ALLOWED' | 'RESTRICTED';
  polygonPoints: Array<{ latitude: number; longitude: number }>;
  alertOnViolation: boolean;
  activeFrom: string | null;
  activeTo: string | null;
  isActive: boolean;
}

export interface AdminPlantLayoutConfig {
  layout: PlantLayout | null;
  coordinates: SmartPlantCoordinate[];
  pathways: SmartPathway[];
  geoFences: SmartGeoFence[];
  hierarchy: {
    departments: Array<{ id: string; code: string; name: string }>;
    modules: Array<{ id: string; code: string | null; name: string; departmentId: string | null }>;
    employees: Array<{ userId: string; fullName: string; userCode: string }>;
  };
}

export interface AdminPlantLayoutPayload {
  plantId: string;
  layoutName: string;
  svgMarkup?: string | null;
  imageDataUrl?: string | null;
  boundaryPoints?: Array<{ latitude: number; longitude: number }> | null;
  departmentMappings?: Array<{
    departmentId: string;
    coordinateId?: string | null;
    productNames?: string[] | null;
    employeeUserIds?: string[] | null;
  }> | null;
  mapData?: Record<string, unknown> | null;
}

export interface CoordinatePayload {
  id?: string | null;
  plantId: string;
  gateId?: string | null;
  departmentId?: string | null;
  moduleId?: string | null;
  locationName: string;
  locationType?: 'GATE' | 'DEPARTMENT' | 'MODULE' | 'KEY_LOCATION' | 'BUILDING';
  latitude: number;
  longitude: number;
  boundaryPoints?: Array<{ latitude: number; longitude: number }> | null;
  meta?: Record<string, unknown> | null;
  isActive?: boolean;
}

export interface PathwayPayload {
  id?: string | null;
  plantId: string;
  pathwayName: string;
  pathType?: 'WALKABLE' | 'RESTRICTED' | 'SERVICE' | 'EMERGENCY';
  startCoordinateId?: string | null;
  endCoordinateId?: string | null;
  cornerPoints?: Array<{ latitude: number; longitude: number }> | null;
  routeMeta?: Record<string, unknown> | null;
  isActive?: boolean;
}

export interface GeoFencePayload {
  id?: string | null;
  plantId: string;
  fenceName: string;
  fenceType?: 'ALLOWED' | 'RESTRICTED';
  polygonPoints: Array<{ latitude: number; longitude: number }>;
  alertOnViolation?: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
  isActive?: boolean;
}

export interface SmartVisitorCreatePayload {
  gateId?: string | null;
  plantId: string;
  departmentId?: string | null;
  moduleId?: string | null;
  personToMeetUserId: string;
  visitorName: string;
  visitorCompany?: string | null;
  visitorPhone?: string | null;
  purpose: string;
  durationHours?: number;
  visitStartTime?: string | null;
  visitEndTime?: string | null;
  desiredVisitAt?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  vehicleNumber?: string | null;
  remarks?: string | null;
}

export interface SmartVisitorCreateResponse {
  gateEntry: VisitorRequestRecord;
  session: {
    id: string;
    gateEntryId: string;
    visitorUserId: string | null;
    plantId: string | null;
    sessionToken: string;
    startTime: string;
    endTime: string;
    status: string;
    approvalStatus: string;
    isActive: boolean;
  };
  visitorCredentials: {
    loginEmail: string;
    mobileNumber: string | null;
    temporaryPassword: string;
    qrToken: string;
    durationHours?: number;
    visitStartTime: string;
    visitEndTime: string;
  };
}

export interface VisitorApprovalPayload {
  gateEntryId?: string | null;
  sessionId?: string | null;
  action: 'APPROVE' | 'REJECT';
  comments?: string | null;
  meetingLocationNodeId?: string | null;
  meetingLocationLabel?: string | null;
  meetingDepartmentId?: string | null;
  escortUserId?: string | null;
}

export interface VisitorSessionStatus {
  sessionId: string;
  gateEntryId: string;
  sessionToken: string;
  status: string;
  approvalStatus: string;
  isActive: boolean;
  accessAllowed: boolean;
  startTime: string;
  endTime: string;
  remainingSeconds: number;
  currentLocation: {
    latitude: number | null;
    longitude: number | null;
    nodeId: string | null;
    nodeLabel: string | null;
    lastSeenAt: string | null;
  };
}

export interface VisitorLocationUpdatePayload {
  sessionToken?: string | null;
  sessionId?: string | null;
  gateEntryId?: string | null;
  latitude: number;
  longitude: number;
  nodeId?: string | null;
  nodeLabel?: string | null;
  source?: 'GPS' | 'MANUAL' | 'CHECKPOINT';
}

export interface SmartNavigationRouteResponse {
  sessionId: string;
  gateEntryId: string;
  sessionStatus: string;
  source: SmartPlantCoordinate;
  destination: SmartPlantCoordinate;
  routeCoordinates: SmartPlantCoordinate[];
  routePathways: SmartPathway[];
  restrictedZones: Array<{ id: string; fenceName: string; polygonPoints: Array<{ latitude: number; longitude: number }> }>;
  steps: string[];
}

export function getAdminPlantLayout(params: { plantId: string }) {
  return httpRequest<ApiResponse<AdminPlantLayoutConfig>>(`/admin/plant-layout${buildQuery(params)}`, { method: 'GET' });
}

export function saveAdminPlantLayout(payload: AdminPlantLayoutPayload) {
  return httpRequest<ApiResponse<PlantLayout>>('/admin/plant-layout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listAdminPlantCoordinates(params: { plantId: string }) {
  return httpRequest<ApiResponse<SmartPlantCoordinate[]>>(`/admin/plant-coordinates${buildQuery(params)}`, { method: 'GET' });
}

export function saveAdminPlantCoordinate(payload: CoordinatePayload) {
  return httpRequest<ApiResponse<SmartPlantCoordinate>>('/admin/plant-coordinates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listAdminPathways(params: { plantId: string }) {
  return httpRequest<ApiResponse<SmartPathway[]>>(`/admin/pathways${buildQuery(params)}`, { method: 'GET' });
}

export function saveAdminPathway(payload: PathwayPayload) {
  return httpRequest<ApiResponse<SmartPathway>>('/admin/pathways', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listAdminGeoFences(params: { plantId: string }) {
  return httpRequest<ApiResponse<SmartGeoFence[]>>(`/admin/geo-fences${buildQuery(params)}`, { method: 'GET' });
}

export function saveAdminGeoFence(payload: GeoFencePayload) {
  return httpRequest<ApiResponse<SmartGeoFence>>('/admin/geo-fences', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createSmartVisitor(payload: SmartVisitorCreatePayload) {
  return httpRequest<ApiResponse<SmartVisitorCreateResponse>>('/visitor/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function approveSmartVisitor(payload: VisitorApprovalPayload) {
  return httpRequest<ApiResponse<Record<string, unknown>>>('/visitor/approve', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function submitVisitorApproval(payload: VisitorApprovalPayload) {
  return httpRequest<ApiResponse<Record<string, unknown>>>('/visitor/approval', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getVisitorSessionStatus(params: { sessionToken?: string; sessionId?: string; gateEntryId?: string } = {}) {
  return httpRequest<ApiResponse<VisitorSessionStatus>>(`/visitor/session-status${buildQuery(params)}`, {
    method: 'GET',
  });
}

export function getVisitorPass(params: { sessionToken?: string; sessionId?: string; gateEntryId?: string } = {}) {
  return httpRequest<ApiResponse<VisitorPassData>>(`/visitor/pass${buildQuery(params)}`, {
    method: 'GET',
  });
}

export function getVisitorTracking(params: { sessionToken?: string; sessionId?: string; gateEntryId?: string; page?: number; limit?: number } = {}) {
  return httpRequest<ApiResponseWithPagination<VisitorTrackingResponse>>(`/visitor/tracking${buildQuery(params)}`, {
    method: 'GET',
  });
}

export function sendVisitorSos(payload: {
  gateEntryId?: string | null;
  sessionId?: string | null;
  plantId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
}) {
  return httpRequest<ApiResponse<{ alertRaised: boolean; notificationsSent: number; gateEntryId: string | null; plantId: string | null }>>('/visitor/sos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateVisitorLocation(payload: VisitorLocationUpdatePayload) {
  return httpRequest<ApiResponse<{ geoFenceStatus: string; alertType: string | null }>>('/visitor/update-location', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getSmartNavigationRoute(params: {
  sessionToken?: string;
  sessionId?: string;
  gateEntryId?: string;
  fromCoordinateId?: string;
  toCoordinateId?: string;
}) {
  return httpRequest<ApiResponse<SmartNavigationRouteResponse>>(`/navigation/route${buildQuery(params)}`, {
    method: 'GET',
  });
}

export function buildVisitorTrackingStreamUrl(params: { sessionToken?: string; sessionId?: string; gateEntryId?: string } = {}) {
  return `${getApiBaseUrl()}/visitor/tracking/stream${buildQuery(params)}`;
}
