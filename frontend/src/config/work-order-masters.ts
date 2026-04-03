export type WorkOrderMasterOptionType = "CATEGORY" | "WO_TYPE" | "FAILURE_CODE";

export interface WorkOrderFallbackOption {
  optionType: WorkOrderMasterOptionType;
  value: string;
  label: string;
  sortOrder: number;
}

export const DEFAULT_WORK_ORDER_MASTER_OPTIONS: WorkOrderFallbackOption[] = [
  { optionType: "CATEGORY", value: "MECHANICAL", label: "Mechanical", sortOrder: 10 },
  { optionType: "CATEGORY", value: "ELECTRICAL", label: "Electrical", sortOrder: 20 },
  { optionType: "CATEGORY", value: "UTILITY", label: "Utility", sortOrder: 30 },
  { optionType: "CATEGORY", value: "TOOL_CHANGE", label: "Tool Change", sortOrder: 40 },
  { optionType: "CATEGORY", value: "CALIBRATION", label: "Calibration", sortOrder: 50 },
  { optionType: "CATEGORY", value: "SAFETY", label: "Safety", sortOrder: 60 },
  { optionType: "WO_TYPE", value: "BREAKDOWN", label: "Breakdown", sortOrder: 10 },
  { optionType: "WO_TYPE", value: "PREVENTIVE", label: "Preventive", sortOrder: 20 },
  { optionType: "WO_TYPE", value: "PREDICTIVE", label: "Predictive", sortOrder: 30 },
  { optionType: "WO_TYPE", value: "CORRECTIVE", label: "Corrective", sortOrder: 40 },
  { optionType: "WO_TYPE", value: "SAFETY", label: "Safety", sortOrder: 50 },
  { optionType: "WO_TYPE", value: "INSTALLATION", label: "Installation", sortOrder: 60 },
  { optionType: "WO_TYPE", value: "INSPECTION", label: "Inspection", sortOrder: 70 },
  { optionType: "WO_TYPE", value: "EMERGENCY", label: "Emergency", sortOrder: 80 },
  { optionType: "FAILURE_CODE", value: "MECH_WEAR", label: "Mechanical Wear", sortOrder: 10 },
  { optionType: "FAILURE_CODE", value: "ELEC_SHORT", label: "Electrical Short", sortOrder: 20 },
  { optionType: "FAILURE_CODE", value: "OVERHEATING", label: "Overheating", sortOrder: 30 },
  { optionType: "FAILURE_CODE", value: "VIBRATION", label: "Excessive Vibration", sortOrder: 40 },
  { optionType: "FAILURE_CODE", value: "LEAK", label: "Leak / Seepage", sortOrder: 50 },
  { optionType: "FAILURE_CODE", value: "SENSOR_FAIL", label: "Sensor Failure", sortOrder: 60 },
  { optionType: "FAILURE_CODE", value: "SOFTWARE", label: "Software / PLC Error", sortOrder: 70 },
  { optionType: "FAILURE_CODE", value: "CORROSION", label: "Corrosion", sortOrder: 80 },
  { optionType: "FAILURE_CODE", value: "FATIGUE", label: "Material Fatigue", sortOrder: 90 },
  { optionType: "FAILURE_CODE", value: "HUMAN_ERROR", label: "Human Error", sortOrder: 100 },
  { optionType: "FAILURE_CODE", value: "OTHER", label: "Other", sortOrder: 110 },
];

export function normalizeWorkOrderCode(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function normalizeWorkOrderOptionType(value: string): WorkOrderMasterOptionType {
  const normalized = normalizeWorkOrderCode(value);
  if (normalized === "TYPE" || normalized === "WORK_ORDER_TYPE" || normalized === "WORKORDER_TYPE" || normalized === "WO_TYPE") {
    return "WO_TYPE";
  }
  if (normalized === "FAILURE" || normalized === "FAILURE_CODES" || normalized === "FAILURE_CODE") {
    return "FAILURE_CODE";
  }
  return "CATEGORY";
}

export function humanizeWorkOrderCode(value: string | null | undefined): string {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getFallbackWorkOrderOptions(optionType: WorkOrderMasterOptionType) {
  return DEFAULT_WORK_ORDER_MASTER_OPTIONS
    .filter((item) => item.optionType === optionType)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({ value: item.value, label: item.label }));
}
