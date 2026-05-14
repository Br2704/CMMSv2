export type WorkOrderMasterOptionType = "CATEGORY" | "WO_TYPE" | "FAILURE_CODE";

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

/** Resolve a work order master code to its display label.
 *  Falls back to humanizeWorkOrderCode if no master list is provided or no match is found.
 */
export function resolveWorkOrderLabel(
  optionType: WorkOrderMasterOptionType,
  code: string | null | undefined,
  plantId?: string | null,
  masters?: Array<{ code: string; label: string; optionType: string; plantId?: string | null }>,
): string {
  if (!code) return '-';
  if (masters && masters.length > 0) {
    const match = masters.find(
      (m) => m.optionType === optionType && m.code === code && (!plantId || !m.plantId || m.plantId === plantId),
    );
    if (match) return match.label;
  }
  return humanizeWorkOrderCode(code);
}

export function humanizeWorkOrderCode(value: string | null | undefined): string {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
