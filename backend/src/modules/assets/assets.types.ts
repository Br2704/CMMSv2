export interface AssetRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateAssetInput = Record<string, unknown>;
export type UpdateAssetInput = Partial<CreateAssetInput>;
