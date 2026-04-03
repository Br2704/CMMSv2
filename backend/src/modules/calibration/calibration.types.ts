export interface CalibrationRecord extends Record<string, unknown> {
  id: string;
  plant_id?: string | null;
}

export type CreateCalibrationInput = Record<string, unknown>;
export type UpdateCalibrationInput = Partial<CreateCalibrationInput>;
