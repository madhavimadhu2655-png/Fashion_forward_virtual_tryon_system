export interface MeasurementPayload {
  shoulder_width: number | null;
  hip_width: number | null;
  torso_length: number | null;
  chest_estimate: number | null;
  waist_estimate: number | null;
  user_height: number | null;
  measurement_unit: string;
  measurement_method: string;
  orientation: string | null;
  confidence: number | null;
  idempotency_key?: string | null;
}

export interface MeasurementRecord extends MeasurementPayload {
  id: string;
  user_id: string;
  created_at: string;
}
