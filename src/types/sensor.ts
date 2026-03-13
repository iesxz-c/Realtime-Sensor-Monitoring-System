export type DeviceStateRow = {
  id: number;
  device_id: string;
  temperature: number | null;
  humidity: number | null;
  gas: number | null;
  updated_at: string;
};

export type SensorHistoryPoint = {
  recordedAt: string;
  temperature: number;
  humidity: number;
  gas: number;
};