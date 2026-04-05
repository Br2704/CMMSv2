import { humanizeWorkOrderCode } from "@/config/work-order-masters";

export function formatWorkOrderCategory(category: string | null | undefined): string {
  return humanizeWorkOrderCode(category);
}
