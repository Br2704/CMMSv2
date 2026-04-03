export interface PlantRecord extends Record<string, unknown> {
  id: string;
}

export type CreatePlantInput = Record<string, unknown>;
export type UpdatePlantInput = Partial<CreatePlantInput>;
