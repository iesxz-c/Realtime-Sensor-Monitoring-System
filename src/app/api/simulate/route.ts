import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseUrl = process.env.SUPABASE_URL;
const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const deviceId = process.env.SIMULATOR_DEVICE_ID ?? "esp32_01";
const timeZone = process.env.SIMULATOR_TIMEZONE ?? "Asia/Kolkata";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildPayload() {
  // Chennai-like baseline with small randomized drift per tick.
  const baseTemperature = 34.0;
  const baseHumidity = 71.0;
  const basePh = 7.0;
  const baseAirQuality = 62;

  const temperature = Number(clamp(baseTemperature + (Math.random() - 0.5) * 0.8, 33.0, 35.0).toFixed(1));
  const humidity = Number(clamp(baseHumidity + (Math.random() - 0.5) * 3.5, 62.0, 85.0).toFixed(1));
  const ph = Number(clamp(basePh + (Math.random() - 0.5) * 0.12, 6.8, 7.4).toFixed(2));
  const air_quality = Math.round(clamp(baseAirQuality + (Math.random() - 0.5) * 6, 50, 80));

  return {
    device_id: deviceId,
    temperature,
    humidity,
    rain_sensor: 0,
    ph,
    air_quality,
    motion_detected: Math.random() > 0.78,
  };
}

function formatDateParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function ymdStringFrom(date: Date, tz: string) {
  const p = formatDateParts(date, tz);
  return `${p.year.toString().padStart(4, "0")}-${p.month.toString().padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
}

function isAuthorized(request: Request) {
  // Trust Vercel cron header; allow manual runs with CRON_SECRET bearer token.
  if (request.headers.has("x-vercel-cron")) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  const enabled = process.env.SIMULATOR_CRON_ENABLED === "true";
  if (!enabled) return NextResponse.json({ ok: false, message: "SIMULATOR_CRON_ENABLED is false" }, { status: 403 });

  if (!isAuthorized(request)) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  if (!baseUrl || !apiKey) {
    return NextResponse.json({ ok: false, message: "Missing SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY" }, { status: 500 });
  }

  // Determine local date/time in specified timezone
  const now = new Date();
  const todayLocal = ymdStringFrom(now, timeZone);
  const tomorrowLocal = ymdStringFrom(new Date(now.getTime() + 24 * 3600 * 1000), timeZone);
  const parts = formatDateParts(now, timeZone);
  const hour = parts.hour;
  const minute = parts.minute;

  // Scheduling rules (explicit dates):
  // - 2026-05-06: run every 10 minutes (minute % 10 === 0)
  // - 2026-05-07 between 09:00-11:59: run every 2 minutes (minute % 2 === 0)
  let shouldRun = false;
  let reason = "not in scheduled window";

  const localDate = ymdStringFrom(now, timeZone);
  const DAY_A = "2026-05-06"; // every 10 minutes on this date
  const DAY_B = "2026-05-07"; // 2-minute window on this date between 09:00-11:59

  if (localDate === DAY_A) {
    if (minute % 5 === 0) {
      shouldRun = true;
      reason = `${DAY_A} every 5 minutes`;
    }
  } else if (localDate === DAY_B) {
    if (hour >= 9 && hour < 12 && minute % 2 === 0) {
      shouldRun = true;
      reason = `${DAY_B} 2-minute window (09:00-11:59)`;
    }
  }

  if (!shouldRun) {
    return NextResponse.json({ ok: true, executed: false, reason, localDate, timeZone, hour, minute });
  }

  const endpoint = `${baseUrl}/rest/v1/device_state?on_conflict=device_id`;
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
    return NextResponse.json({ ok: false, message: `Supabase request failed (${response.status})`, detail: text }, { status: 500 });
  }

  const body = await response.json();
  return NextResponse.json({ ok: true, executed: true, reason, updated_at: body[0]?.updated_at ?? null, payload });
}