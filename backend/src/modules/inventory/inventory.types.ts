export interface InventoryRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateInventoryInput = Record<string, unknown>;
export type UpdateInventoryInput = Partial<CreateInventoryInput>;
