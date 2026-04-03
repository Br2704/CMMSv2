export interface WorkOrderRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateWorkOrderInput = Record<string, unknown>;
export type UpdateWorkOrderInput = Partial<CreateWorkOrderInput>;
