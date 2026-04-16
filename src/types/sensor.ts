export type DeviceStateRow = {
  id: number;
  device_id: string;
  temperature: number | null;
  humidity: number | null;
  water_level: number | null;
  ph: number | null;
  air_quality: number | null;
  noise_level: number | null;
  motion_detected: boolean | null;
  updated_at: string;
};

export type SensorHistoryPoint = {
  recordedAt: string;
  temperature: number;
  humidity: number;
  water_level: number;
  ph: number;
  air_quality: number;
  noise_level: number;
  motion_detected: boolean;
};