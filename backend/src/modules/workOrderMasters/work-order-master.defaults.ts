export type WorkOrderMasterOptionType = 'CATEGORY' | 'WO_TYPE' | 'FAILURE_CODE';

export interface DefaultWorkOrderMasterOption {
  optionType: WorkOrderMasterOptionType;
  code: string;
  label: string;
  description?: string | null;
  sortOrder: number;
}

export const WORK_ORDER_MASTER_OPTION_TYPES: WorkOrderMasterOptionType[] = ['CATEGORY', 'WO_TYPE', 'FAILURE_CODE'];

export const DEFAULT_WORK_ORDER_MASTER_OPTIONS: DefaultWorkOrderMasterOption[] = [
  { optionType: 'CATEGORY', code: 'MECHANICAL', label: 'Mechanical', sortOrder: 10 },
  { optionType: 'CATEGORY', code: 'ELECTRICAL', label: 'Electrical', sortOrder: 20 },
  { optionType: 'CATEGORY', code: 'UTILITY', label: 'Utility', sortOrder: 30 },
  { optionType: 'CATEGORY', code: 'TOOL_CHANGE', label: 'Tool Change', sortOrder: 40 },
  { optionType: 'CATEGORY', code: 'CALIBRATION', label: 'Calibration', sortOrder: 50 },
  { optionType: 'CATEGORY', code: 'SAFETY', label: 'Safety', sortOrder: 60 },
  { optionType: 'WO_TYPE', code: 'BREAKDOWN', label: 'Breakdown', sortOrder: 10 },
  { optionType: 'WO_TYPE', code: 'PREVENTIVE', label: 'Preventive', sortOrder: 20 },
  { optionType: 'WO_TYPE', code: 'PREDICTIVE', label: 'Predictive', sortOrder: 30 },
  { optionType: 'WO_TYPE', code: 'CORRECTIVE', label: 'Corrective', sortOrder: 40 },
  { optionType: 'WO_TYPE', code: 'SAFETY', label: 'Safety', sortOrder: 50 },
  { optionType: 'WO_TYPE', code: 'INSTALLATION', label: 'Installation', sortOrder: 60 },
  { optionType: 'WO_TYPE', code: 'INSPECTION', label: 'Inspection', sortOrder: 70 },
  { optionType: 'WO_TYPE', code: 'EMERGENCY', label: 'Emergency', sortOrder: 80 },
  { optionType: 'FAILURE_CODE', code: 'MECH_WEAR', label: 'Mechanical Wear', sortOrder: 10 },
  { optionType: 'FAILURE_CODE', code: 'ELEC_SHORT', label: 'Electrical Short', sortOrder: 20 },
  { optionType: 'FAILURE_CODE', code: 'OVERHEATING', label: 'Overheating', sortOrder: 30 },
  { optionType: 'FAILURE_CODE', code: 'VIBRATION', label: 'Excessive Vibration', sortOrder: 40 },
  { optionType: 'FAILURE_CODE', code: 'LEAK', label: 'Leak / Seepage', sortOrder: 50 },
  { optionType: 'FAILURE_CODE', code: 'SENSOR_FAIL', label: 'Sensor Failure', sortOrder: 60 },
  { optionType: 'FAILURE_CODE', code: 'SOFTWARE', label: 'Software / PLC Error', sortOrder: 70 },
  { optionType: 'FAILURE_CODE', code: 'CORROSION', label: 'Corrosion', sortOrder: 80 },
  { optionType: 'FAILURE_CODE', code: 'FATIGUE', label: 'Material Fatigue', sortOrder: 90 },
  { optionType: 'FAILURE_CODE', code: 'HUMAN_ERROR', label: 'Human Error', sortOrder: 100 },
  { optionType: 'FAILURE_CODE', code: 'OTHER', label: 'Other', sortOrder: 110 },
];

export function normalizeWorkOrderMasterCode(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function normalizeWorkOrderMasterOptionType(input: string): WorkOrderMasterOptionType {
  const normalized = normalizeWorkOrderMasterCode(input);
  if (normalized === 'TYPE' || normalized === 'WORK_ORDER_TYPE' || normalized === 'WORKORDER_TYPE' || normalized === 'WO_TYPE') {
    return 'WO_TYPE';
  }
  if (normalized === 'FAILURE' || normalized === 'FAILURE_CODES' || normalized === 'FAILURE_CODE') {
    return 'FAILURE_CODE';
  }
  return 'CATEGORY';
}
