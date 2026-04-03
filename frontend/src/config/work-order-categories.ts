import { getFallbackWorkOrderOptions, humanizeWorkOrderCode } from "@/config/work-order-masters";

export const WORK_ORDER_CATEGORY_OPTIONS = getFallbackWorkOrderOptions("CATEGORY");

export function formatWorkOrderCategory(category: string | null | undefined): string {
  return humanizeWorkOrderCode(category);
}
