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

function buildPayload() {
  return {
    device_id: deviceId,
    temperature: Number((24 + Math.random() * 8).toFixed(1)),
    humidity: Number((50 + Math.random() * 25).toFixed(1)),
    water_level: Number((35 + Math.random() * 45).toFixed(1)),
    ph: Number((6.2 + Math.random() * 1.4).toFixed(2)),
    light_intensity: Number((220 + Math.random() * 600).toFixed(0)),
    noise_level: Number((35 + Math.random() * 35).toFixed(1)),
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