import "dotenv/config";

const baseUrl = process.env.SUPABASE_URL;
const apiKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const deviceId = process.env.SIMULATOR_DEVICE_ID ?? "esp32_01";
const intervalMs = Number(process.env.SIMULATOR_INTERVAL_MS ?? 3000);

if (!baseUrl || !apiKey) {
  console.error(
    "Missing SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.",
  );
  process.exit(1);
}

const endpoint = `${baseUrl}/rest/v1/device_state?on_conflict=device_id`;

let currentTemperature = 34.0;
let currentHumidity = 71.0;
let currentPh = 7.1;
let currentAirQuality = 62;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildPayload() {
  // Gentle random walk tuned for Chennai-like heat and humidity.
  currentTemperature = clamp(currentTemperature + (Math.random() - 0.5) * 0.35, 33.0, 35.0);
  const humidityTarget = 70 - (currentTemperature - 34) * 3;
  currentHumidity = clamp(
    currentHumidity * 0.72 + humidityTarget * 0.28 + (Math.random() - 0.5) * 0.8,
    62.0,
    82.0,
  );
  currentPh = clamp(currentPh + (Math.random() - 0.5) * 0.08, 6.8, 7.4);
  currentAirQuality = Math.round(
    clamp(currentAirQuality + (Math.random() - 0.5) * 4, 52, 78),
  );

  return {
    device_id: deviceId,
    temperature: Number(currentTemperature.toFixed(1)),
    humidity: Number(currentHumidity.toFixed(1)),
    rain_sensor: 0,
    ph: Number(currentPh.toFixed(2)),
    air_quality: currentAirQuality,
    motion_detected: Math.random() > 0.75,
  };
}

async function sendReading() {
  const payload = buildPayload();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  const body = await response.json();
  console.log(new Date().toISOString(), payload, body[0]?.updated_at ?? null);
}

await sendReading();
setInterval(() => {
  sendReading().catch((error) => {
    console.error(error.message);
  });
}, intervalMs);