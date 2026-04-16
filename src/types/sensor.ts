export type DeviceStateRow = {
  id: number;
  device_id: string;
  temperature: number | null;
  humidity: number | null;
  rain_sensor: number | null;
  ph: number | null;
  air_quality: number | null;
  motion_detected: boolean | null;
  updated_at: string;
};

export type SensorHistoryPoint = {
  recordedAt: string;
  temperature: number;
  humidity: number;
  rain_sensor: number;
  ph: number;
  air_quality: number;
  motion_detected: boolean;
};