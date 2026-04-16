"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { DeviceStateRow, SensorHistoryPoint } from "@/types/sensor";

const deviceId = process.env.NEXT_PUBLIC_DEVICE_ID ?? "esp32_01";
const offlineThresholdSeconds = Number(
  process.env.NEXT_PUBLIC_OFFLINE_THRESHOLD_SECONDS ?? 30,
);

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const sanctuaryIssues = [
  {
    title: "Shrinking and unstable water spread",
    detail:
      "Irregular inflow and seasonal stress reduce wetland quality, nesting confidence, and food availability for migratory birds.",
  },
  {
    title: "Noise and human disturbance",
    detail:
      "Road activity, tourism pressure, and unmanaged movement can disrupt feeding and breeding rhythms across sensitive zones.",
  },
  {
    title: "Water quality drift",
    detail:
      "Changes in pH, contamination, and stagnant pockets can alter aquatic life and reduce habitat resilience.",
  },
  {
    title: "Climate variability",
    detail:
      "Hotter days and longer dry periods shift comfort ranges and stress wetland-dependent species over time.",
  },
];

const sanctuarySolutions = [
  "Use realtime sensor thresholds to trigger field checks before habitat stress becomes visible.",
  "Protect quiet nesting windows with visitor zoning, noise caps, and better movement control near sensitive areas.",
  "Stabilize water quality through desilting, inflow management, and regular chemistry review using pH and water-level data.",
  "Combine on-site telemetry with ranger observations to prioritize habitat restoration where repeated drift is detected.",
];

const architectureFlowSteps = [
  {
    title: "ESP32 sensor node",
    detail:
      "The field device reads temperature, humidity, rain detection, pH, air quality, and motion from attached sensors. Noise is captured from the laptop microphone.",
    accent: "bg-rose-400/25",
  },
  {
    title: "Supabase ingestion + realtime",
    detail:
      "Sensor payloads are upserted into device_state, then broadcast through Supabase Realtime for immediate UI updates.",
    accent: "bg-cyan-400/25",
  },
  {
    title: "Next.js analysis surface",
    detail:
      "The web app renders live cards, charts, comparisons, and guidance panels for monitoring and presentation.",
    accent: "bg-emerald-400/25",
  },
];

const keyOutcomes = [
  "Realtime monitoring of seven environmental signals in one interface.",
  "Visual evidence for habitat stress using charts, recent rows, and guidance targets.",
  "Cloud-ready architecture that works even before final hardware deployment through a simulator.",
];

const futureScope = [
  "Add alerting by SMS or email when thresholds are crossed for long periods.",
  "Store multi-device history for zone-level comparison across the sanctuary.",
  "Layer camera or ranger observations on top of sensor drift for stronger ecological analysis.",
];

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildHistoryPoint(row: DeviceStateRow): SensorHistoryPoint | null {
  const temperature = row.temperature;
  const humidity = row.humidity;
  const rainSensor = row.rain_sensor;
  const ph = row.ph;
  const airQuality = row.air_quality;
  const motionDetected = row.motion_detected;

  if (
    !isFiniteNumber(temperature) ||
    !isFiniteNumber(humidity) ||
    !isFiniteNumber(rainSensor) ||
    !isFiniteNumber(ph) ||
    !isFiniteNumber(airQuality) ||
    typeof motionDetected !== "boolean"
  ) {
    return null;
  }

  return {
    recordedAt: row.updated_at,
    temperature,
    humidity,
    rain_sensor: rainSensor,
    ph,
    air_quality: airQuality,
    motion_detected: motionDetected,
  };
}

function pushHistory(
  points: SensorHistoryPoint[],
  row: DeviceStateRow,
): SensorHistoryPoint[] {
  const nextPoint = buildHistoryPoint(row);

  if (!nextPoint) {
    return points;
  }

  const deduped = points.filter((point) => point.recordedAt !== nextPoint.recordedAt);
  return [...deduped, nextPoint].slice(-18);
}

function formatValue(value: number | null, suffix: string) {
  if (!isFiniteNumber(value)) {
    return "--";
  }

  return `${value.toFixed(1)}${suffix}`;
}

function formatLastSeen(updatedAt: string | null, now: number) {
  if (!updatedAt) {
    return "Waiting for first reading";
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(updatedAt).getTime()) / 1000),
  );

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  return timeFormatter.format(new Date(updatedAt));
}

type ChartPoint = {
  time: string;
  fullTime: string;
  temperature: number;
  humidity: number;
  rain_sensor: number;
  ph: number;
  air_quality: number;
  noise_level: number;
  motion_detected: boolean;
  motion_score: number;
  motion_activity: number;
  temperature_trend: number;
  humidity_trend: number;
  rain_sensor_trend: number;
  ph_trend: number;
  air_quality_trend: number;
  noise_level_trend: number;
  motion_trend: number;
};

type NoiseHistoryPoint = {
  recordedAt: string;
  noise: number;
};

type SensorMetricKey =
  | "temperature"
  | "humidity"
  | "rain_sensor"
  | "ph"
  | "air_quality"
  | "motion_score";

const sensorMetricOptions: Array<{
  key: SensorMetricKey;
  label: string;
  stroke: string;
  unit: string;
  chartType?: "monotone" | "stepAfter";
}> = [
  { key: "temperature", label: "Temperature", stroke: "#fb7185", unit: "C" },
  { key: "humidity", label: "Humidity", stroke: "#22d3ee", unit: "%" },
  { key: "rain_sensor", label: "Rain Sensor", stroke: "#3b82f6", unit: "mm" },
  { key: "ph", label: "pH", stroke: "#4ade80", unit: "pH" },
  { key: "air_quality", label: "Air Quality", stroke: "#fcd34d", unit: "AQI" },
  {
    key: "motion_score",
    label: "Motion",
    stroke: "#7dd3fc",
    unit: "state",
    chartType: "stepAfter",
  },
];

function HeroMetric({
  label,
  value,
  accentClass,
}: {
  label: string;
  value: string;
  accentClass: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(10,22,44,0.82),rgba(4,10,24,0.92))] p-4">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-3xl ${accentClass}`} />
      <p className="relative text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="relative mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">{value}</p>
    </div>
  );
}

function HeroSection({
  deviceId,
  lastSeen,
  online,
  offlineThresholdSeconds,
  temperature,
  humidity,
  rainSensor,
  ph,
  airQuality,
  microphoneNoiseLevel,
  motionDetected,
}: {
  deviceId: string;
  lastSeen: string;
  online: boolean;
  offlineThresholdSeconds: number;
  temperature: string;
  humidity: string;
  rainSensor: string;
  ph: string;
  airQuality: string;
  microphoneNoiseLevel: string;
  motionDetected: boolean | null;
}) {
  return (
    <section className="animate-rise relative overflow-hidden rounded-4xl border border-white/10 bg-[linear-gradient(135deg,rgba(5,14,31,0.98),rgba(3,11,24,0.96)_42%,rgba(7,24,41,0.96)_100%)] p-6 md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_82%_28%,rgba(251,191,36,0.14),transparent_24%),radial-gradient(circle_at_58%_82%,rgba(74,222,128,0.12),transparent_22%)]" />
      <div className="relative grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-100/90">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-300" : "bg-rose-300"}`} />
            Live Wetland Telemetry
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-white md:text-6xl">
            Vedanthangal Ecosystem Monitoring
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
            A live habitat command surface for temperature, humidity, rain detection, pH, air quality, microphone-captured noise, and motion, streamed from the field into a realtime dashboard.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
              Device {deviceId}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
              Last update {lastSeen}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
              Threshold {offlineThresholdSeconds}s
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <HeroMetric label="Temperature" value={temperature} accentClass="bg-rose-400/25" />
            <HeroMetric label="Humidity" value={humidity} accentClass="bg-cyan-400/25" />
            <HeroMetric label="Rain Sensor" value={rainSensor} accentClass="bg-blue-400/25" />
            <HeroMetric label="pH" value={ph} accentClass="bg-emerald-400/25" />
            <HeroMetric label="Air Quality" value={airQuality} accentClass="bg-amber-300/25" />
            <HeroMetric label="Microphone Noise" value={microphoneNoiseLevel} accentClass="bg-violet-300/25" />
          </div>
        </div>

        <div className="grid gap-4 self-stretch">
          <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,19,38,0.92),rgba(5,11,25,0.96))] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.38)]">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">System status</p>
            <div className="mt-5 flex items-center gap-3">
              <span className={`h-3.5 w-3.5 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
              <p className={`text-3xl font-semibold ${online ? "text-emerald-300" : "text-rose-300"}`}>
                {online ? "Online" : "Offline"}
              </p>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Motion {motionDetected ? "Detected" : "Clear"}
            </p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Telemetry focus</p>
              <p className="mt-3 text-lg font-medium text-white">Bird sanctuary habitat balance</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Watch environmental drift, water chemistry, acoustic change, and presence bursts from a single surface.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Realtime stack</p>
              <p className="mt-2 text-lg font-medium text-white">ESP32, Supabase, Next.js</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Motion channel</p>
              <p className="mt-2 text-lg font-medium text-white">
                {motionDetected ? "Activity pulse active" : "Quiet window detected"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
  anchor,
}: {
  eyebrow: string;
  title: string;
  description: string;
  anchor?: string;
}) {
  return (
    <div id={anchor} className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.26em] text-cyan-200/80">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">{title}</h2>
      </div>
      <p className="max-w-2xl text-sm leading-7 text-slate-300/80 md:text-base">{description}</p>
    </div>
  );
}

function ArchitectureShowcase() {
  return (
    <article className="glass-hover rounded-[1.75rem] border border-sky-300/15 bg-[linear-gradient(180deg,rgba(6,18,39,0.94),rgba(4,10,24,0.98))] p-5 shadow-[0_30px_80px_rgba(2,8,23,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-sky-200/70">Architecture flow section</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">ESP32 to Supabase to Next.js pipeline</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300/80">
            A presentation-friendly summary of how field telemetry is captured, stored, broadcast, and visualized for sanctuary monitoring.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Core stack</p>
          <p className="mt-1 text-lg font-semibold text-white">ESP32, Supabase, Next.js</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {architectureFlowSteps.map((step, index) => (
          <div key={step.title} className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-3xl ${step.accent}`} />
            <p className="relative text-xs uppercase tracking-[0.22em] text-slate-400">Step {index + 1}</p>
            <h4 className="relative mt-3 text-xl font-semibold text-white">{step.title}</h4>
            <p className="relative mt-3 text-sm leading-6 text-slate-300/80">{step.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-[#041121] p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/75">Pipeline diagram</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
          <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-center">
            <p className="text-sm font-medium text-rose-100">ESP32 + sensors</p>
            <p className="mt-1 text-xs text-slate-300">Reads field telemetry</p>
          </div>
          <div className="text-center text-2xl text-slate-500">→</div>
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-center">
            <p className="text-sm font-medium text-cyan-100">Supabase REST + Realtime</p>
            <p className="mt-1 text-xs text-slate-300">Stores rows and broadcasts updates</p>
          </div>
          <div className="text-center text-2xl text-slate-500">→</div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-center">
            <p className="text-sm font-medium text-emerald-100">Next.js dashboard</p>
            <p className="mt-1 text-xs text-slate-300">Renders charts, guidance, and reports</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-amber-200/75">Key outcomes</p>
          <div className="mt-4 grid gap-3">
            {keyOutcomes.map((outcome) => (
              <div key={outcome} className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-slate-200/90">
                {outcome}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/75">Future scope</p>
          <div className="mt-4 grid gap-3">
            {futureScope.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-slate-200/90">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function SanctuaryFooter() {
  return (
    <footer className="mt-8 rounded-4xl border border-white/10 bg-[linear-gradient(180deg,rgba(5,14,31,0.96),rgba(3,10,22,0.98))] p-6 md:p-8">
      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-amber-200/75">Sanctuary outlook</p>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
            Current issues in Vedanthangal Bird Sanctuary and how this system can help
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {sanctuaryIssues.map((issue) => (
              <article key={issue.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-lg font-medium text-white">{issue.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300/80">{issue.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="rounded-[1.75rem] border border-emerald-300/15 bg-[linear-gradient(180deg,rgba(8,26,25,0.86),rgba(4,14,20,0.96))] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/70">Response ideas</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">How to solve and act faster</h3>
            <div className="mt-4 grid gap-3">
              {sanctuarySolutions.map((solution) => (
                <div key={solution} className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm leading-6 text-slate-200/90">
                  {solution}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function ChartPanel({
  title,
  subtitle,
  unit,
  data,
  dataKey,
  stroke,
  domain,
  delay,
  animated = true,
}: {
  title: string;
  subtitle: string;
  unit: string;
  data: ChartPoint[];
  dataKey:
    | "temperature"
    | "humidity"
    | "rain_sensor"
    | "ph"
    | "air_quality"
    | "noise_level"
    | "motion_score";
  stroke: string;
  domain?: [number, number];
  delay?: string;
  animated?: boolean;
}) {
  return (
    <article
      className="animate-rise glass-hover rounded-2xl border border-white/10 bg-[linear-gradient(170deg,rgba(5,16,35,0.92),rgba(4,10,24,0.94))] p-5"
      style={delay ? { animationDelay: delay } : undefined}
    >
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300/80">{title}</p>
          <p className="text-2xl font-semibold text-white">{subtitle}</p>
        </div>
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">{unit}</p>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={260}>
          <LineChart data={data} margin={{ top: 12, right: 10, left: -16, bottom: 6 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.14)" strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={domain ?? ["auto", "auto"]}
            />
            <Tooltip
              cursor={{ stroke: "rgba(148,163,184,0.45)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid rgba(148,163,184,0.25)",
                backgroundColor: "rgba(4,11,25,0.96)",
                color: "#e2e8f0",
              }}
              labelFormatter={(value, payload) => {
                const item = payload?.[0]?.payload as ChartPoint | undefined;
                return item?.fullTime ?? String(value);
              }}
              formatter={(value) => [value, dataKey]}
            />
            <Line
              type="natural"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={3}
              dot={false}
              isAnimationActive={animated}
              animationDuration={620}
              animationEasing="ease-in-out"
              activeDot={{ r: 5, fill: stroke, stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function MotionPanel({ data, delay }: { data: ChartPoint[]; delay?: string }) {
  const activeCount = data.filter((item) => item.motion_detected).length;
  const activityPercent = data.length ? Math.round((activeCount / data.length) * 100) : 0;

  return (
    <article
      className="animate-rise glass-hover rounded-2xl border border-white/10 bg-[linear-gradient(170deg,rgba(5,16,35,0.92),rgba(4,10,24,0.94))] p-5"
      style={delay ? { animationDelay: delay } : undefined}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300/80">Motion activity (24h)</p>
          <p className="text-2xl font-semibold text-white">Presence pulses and quiet windows</p>
        </div>
        <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/80">Active windows</p>
          <p className="text-lg font-semibold text-cyan-100">{activityPercent}%</p>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={260}>
          <LineChart data={data} margin={{ top: 12, right: 10, left: -16, bottom: 6 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.14)" strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              ticks={[0, 100]}
              domain={[0, 100]}
            />
            <Tooltip
              cursor={{ stroke: "rgba(148,163,184,0.45)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid rgba(148,163,184,0.25)",
                backgroundColor: "rgba(4,11,25,0.96)",
                color: "#e2e8f0",
              }}
              labelFormatter={(value, payload) => {
                const item = payload?.[0]?.payload as ChartPoint | undefined;
                return item?.fullTime ?? String(value);
              }}
              formatter={(_, __, item) => {
                const payload = item.payload as ChartPoint;
                return [payload.motion_detected ? "Detected" : "Clear", "motion"];
              }}
            />
            <Line
              type="monotone"
              dataKey="motion_activity"
              stroke="#38bdf8"
              strokeWidth={3.2}
              dot={false}
              isAnimationActive
              animationDuration={620}
              animationEasing="ease-in-out"
              activeDot={{ r: 5, fill: "#38bdf8", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function SelectableMultiPlot({
  data,
  selectedMetrics,
  onToggleMetric,
}: {
  data: ChartPoint[];
  selectedMetrics: SensorMetricKey[];
  onToggleMetric: (key: SensorMetricKey) => void;
}) {
  return (
    <article
      className="animate-rise glass-hover rounded-2xl border border-white/10 bg-[linear-gradient(170deg,rgba(5,16,35,0.92),rgba(4,10,24,0.94))] p-5"
      style={{ animationDelay: "0.46s" }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-slate-300/80">Custom multiplot</p>
          <p className="text-2xl font-semibold text-white">Compare any selected sensor combination</p>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Pick one or more sensors. If you choose three, only those three are plotted. Motion is shown as an activity pulse.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Selected</p>
          <p className="text-lg font-semibold text-white">{selectedMetrics.length} metrics</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {sensorMetricOptions.map((option) => {
          const active = selectedMetrics.includes(option.key);

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onToggleMetric(option.key)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                active
                  ? "border-transparent text-slate-950 shadow-[0_0_30px_rgba(125,211,252,0.16)]"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
              }`}
              style={active ? { backgroundColor: option.stroke } : undefined}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 h-120">
        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={320}>
          <LineChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 6 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.14)" strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={[0, "auto"]}
            />
            <Tooltip
              cursor={{ stroke: "rgba(148,163,184,0.45)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid rgba(148,163,184,0.25)",
                backgroundColor: "rgba(4,11,25,0.96)",
                color: "#e2e8f0",
              }}
              labelFormatter={(value, payload) => {
                const item = payload?.[0]?.payload as ChartPoint | undefined;
                return item?.fullTime ?? String(value);
              }}
              formatter={(value, name) => {
                const option = sensorMetricOptions.find((item) => item.key === name);

                if (name === "motion_score") {
                  return [Number(value) >= 50 ? "Detected" : "Clear", "Motion"];
                }

                return [`${Number(value).toFixed(1)} ${option?.unit ?? ""}`.trim(), option?.label ?? String(name)];
              }}
            />
            {sensorMetricOptions
              .filter((option) => selectedMetrics.includes(option.key))
              .map((option) => (
                <Line
                  key={option.key}
                  type={option.chartType ?? "natural"}
                  dataKey={option.key}
                  stroke={option.stroke}
                  strokeWidth={3}
                  dot={false}
                  strokeDasharray={option.key === "motion_score" ? "5 4" : undefined}
                  isAnimationActive
                  animationDuration={950}
                  animationEasing="ease-out"
                  activeDot={{ r: 5, fill: option.stroke, stroke: "#0f172a", strokeWidth: 2 }}
                  className="chart-line-flow"
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function MultiSeriesPanel({ data }: { data: ChartPoint[] }) {
  type TrendMetricKey =
    | "temperature_trend"
    | "humidity_trend"
    | "rain_sensor_trend"
    | "ph_trend"
    | "air_quality_trend"
    | "noise_level_trend"
    | "motion_trend";

  const [focusedMetric, setFocusedMetric] = useState<TrendMetricKey | null>(null);

  const trendSeries: Array<{
    key: TrendMetricKey;
    label: string;
    stroke: string;
    type: "monotone" | "stepAfter";
  }> = [
    { key: "temperature_trend", label: "Temperature", stroke: "#fb7185", type: "monotone" as const },
    { key: "humidity_trend", label: "Humidity", stroke: "#22d3ee", type: "monotone" as const },
    { key: "rain_sensor_trend", label: "Rain Sensor", stroke: "#60a5fa", type: "monotone" as const },
    { key: "ph_trend", label: "pH", stroke: "#4ade80", type: "monotone" as const },
    { key: "air_quality_trend", label: "Air Quality", stroke: "#fcd34d", type: "monotone" as const },
    { key: "noise_level_trend", label: "Microphone Noise", stroke: "#c4b5fd", type: "monotone" as const },
    { key: "motion_trend", label: "Motion", stroke: "#7dd3fc", type: "stepAfter" as const },
  ];

  const climateSeries = trendSeries.filter((series) =>
    ["temperature_trend", "humidity_trend", "rain_sensor_trend", "ph_trend"].includes(series.key),
  );

  const disturbanceSeries = trendSeries.filter((series) =>
    ["air_quality_trend", "noise_level_trend", "motion_trend"].includes(series.key),
  );

  const labelMap: Record<string, string> = {
    temperature_trend: "Temperature",
    humidity_trend: "Humidity",
    rain_sensor_trend: "Rain Sensor",
    ph_trend: "pH",
    air_quality_trend: "Air Quality",
    noise_level_trend: "Microphone Noise",
    motion_trend: "Motion",
  };

  const renderBand = ({
    title,
    subtitle,
    series,
    minHeight,
  }: {
    title: string;
    subtitle: string;
    series: Array<{
      key: TrendMetricKey;
      label: string;
      stroke: string;
      type: "monotone" | "stepAfter";
    }>;
    minHeight: number;
  }) => (
    <div className="rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(4,11,24,0.76),rgba(3,9,19,0.92))] p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{title}</p>
          <p className="mt-1 text-xl font-semibold text-white">{subtitle}</p>
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Shared timeline</p>
      </div>

      <div className="h-90 md:h-96">
        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={minHeight}>
          <LineChart syncId="ecosystem-trend" data={data} margin={{ top: 12, right: 12, left: -12, bottom: 6 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.14)" strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              width={44}
              label={{
                value: "Trend index",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#94a3b8", fontSize: 12 },
              }}
            />
            <Tooltip
              cursor={{ stroke: "rgba(148,163,184,0.45)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid rgba(148,163,184,0.25)",
                backgroundColor: "rgba(4,11,25,0.96)",
                color: "#e2e8f0",
              }}
              labelFormatter={(value, payload) => {
                const item = payload?.[0]?.payload as ChartPoint | undefined;
                return item?.fullTime ?? String(value);
              }}
              formatter={(value, name) => {
                if (name === "motion_trend") {
                  return [Number(value) >= 50 ? "Detected" : "Clear", "Motion"];
                }

                return [`${Number(value).toFixed(0)}%`, labelMap[String(name)] ?? String(name)];
              }}
            />
            {series.map((item) => {
              const active = !focusedMetric || focusedMetric === item.key;

              return (
                <Line
                  key={item.key}
                  type={item.type === "monotone" ? "natural" : item.type}
                  dataKey={item.key}
                  stroke={item.stroke}
                  strokeWidth={active ? (item.key === "motion_trend" ? 3.8 : 3.2) : 1.8}
                  strokeOpacity={active ? 1 : 0.18}
                  dot={false}
                  connectNulls
                  strokeLinecap="round"
                  strokeDasharray={item.key === "motion_trend" ? "6 4" : undefined}
                  isAnimationActive
                  animationDuration={1000}
                  animationEasing="ease-out"
                  activeDot={{ r: 5, fill: item.stroke, stroke: "#0f172a", strokeWidth: 2 }}
                  className={active ? "chart-line-flow" : undefined}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <article className="animate-rise glass-hover rounded-2xl border border-white/10 bg-[linear-gradient(170deg,rgba(5,16,35,0.92),rgba(4,10,24,0.94))] p-5" style={{ animationDelay: "0.35s" }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300/80">Ecosystem trend (combined)</p>
          <p className="text-2xl font-semibold text-white">All-sensor trend index with motion pulses</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Hover a metric chip to isolate it. Every line is normalized to a 0-100 habitat trend index so different units stay readable on one chart.
          </p>
        </div>

        <div className="flex max-w-3xl flex-wrap items-center justify-end gap-2 text-xs uppercase tracking-[0.18em] text-slate-300/80">
          {trendSeries.map((series) => {
            const active = !focusedMetric || focusedMetric === series.key;

            return (
              <button
                key={series.key}
                type="button"
                onMouseEnter={() => setFocusedMetric(series.key)}
                onMouseLeave={() => setFocusedMetric(null)}
                onFocus={() => setFocusedMetric(series.key)}
                onBlur={() => setFocusedMetric(null)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
                  active
                    ? "border-white/15 bg-white/6 text-slate-100"
                    : "border-white/8 bg-transparent text-slate-500"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.stroke }} />
                {series.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4">
        {renderBand({
          title: "Climate and chemistry",
          subtitle: "Temperature, humidity, water level, and pH",
          series: climateSeries,
          minHeight: 360,
        })}
        {renderBand({
          title: "Disturbance and light/activity",
              subtitle: "Air quality, noise, and motion pulses",
          series: disturbanceSeries,
          minHeight: 340,
        })}
      </div>
    </article>
  );
}

function SanctuaryBand({
  label,
  current,
  ideal,
  unit,
  progress,
  state,
}: {
  label: string;
  current: string;
  ideal: string;
  unit: string;
  progress: number;
  state: "good" | "warn";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#061225] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300/85">{label}</p>
          <p className="mt-1 text-xl font-semibold text-white">{current} {unit}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">ideal {ideal} {unit}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            state === "good" ? "bg-emerald-300/20 text-emerald-200" : "bg-amber-300/20 text-amber-200"
          }`}
        >
          {state === "good" ? "Optimal" : "Adjust"}
        </span>
      </div>

      <div className="mt-3 h-2.5 rounded-full bg-white/8">
        <div
          className={`h-full rounded-full ${state === "good" ? "bg-emerald-300" : "bg-amber-300"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function SanctuaryPanel({
  temperature,
  humidity,
  ph,
  rainSensor,
  airQuality,
  microphoneNoiseLevel,
  motionDetected,
}: {
  temperature: number | null;
  humidity: number | null;
  ph: number | null;
  rainSensor: number | null;
  airQuality: number | null;
  microphoneNoiseLevel: number | null;
  motionDetected: boolean | null;
}) {
  const rangeProgress = (
    value: number | null,
    min: number,
    max: number,
  ): { progress: number; state: "good" | "warn"; text: string } => {
    if (!isFiniteNumber(value)) {
      return { progress: 0, state: "warn" as const, text: "--" };
    }

    const normalized = ((value - min) / (max - min)) * 100;
    const progress = Math.max(0, Math.min(100, normalized));
    const state: "good" | "warn" = value >= min && value <= max ? "good" : "warn";
    return { progress, state, text: value.toFixed(1) };
  };

  const humidityBand = rangeProgress(humidity, 55, 75);
  const temperatureBand = rangeProgress(temperature, 24, 32);
  const phBand = rangeProgress(ph, 6.5, 8.0);
  const airQualityBand = rangeProgress(airQuality, 50, 100);
  const noiseBand = rangeProgress(microphoneNoiseLevel, 20, 55);
  const motionBand =
    motionDetected === null
      ? { progress: 0, state: "warn" as const, text: "--", ideal: "low disturbance" }
      : {
          progress: motionDetected ? 100 : 28,
          state: motionDetected ? ("warn" as const) : ("good" as const),
          text: motionDetected ? "Detected" : "Quiet",
          ideal: "quiet habitat",
        };

  return (
    <article
      className="animate-rise glass-hover rounded-2xl border border-emerald-300/20 bg-[linear-gradient(165deg,rgba(4,26,31,0.84),rgba(3,14,23,0.94))] p-5"
      style={{ animationDelay: "0.3s" }}
    >
      <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Vedanthangal sanctuary guidance</p>
      <h3 className="mt-2 text-2xl font-semibold text-white">Ideal habitat vs current</h3>
      <p className="mt-2 text-sm text-slate-300/80">
        Baseline comfort targets for wetland bird-friendly ambient conditions.
      </p>

      <div className="mt-4 grid gap-3">
        <SanctuaryBand
          label="Humidity"
          current={humidityBand.text}
          ideal="55 - 75"
          unit="%"
          progress={humidityBand.progress}
          state={humidityBand.state}
        />
        <SanctuaryBand
          label="Temperature"
          current={temperatureBand.text}
          ideal="24 - 32"
          unit="C"
          progress={temperatureBand.progress}
          state={temperatureBand.state}
        />
        <SanctuaryBand
          label="pH"
          current={phBand.text}
          ideal="6.5 - 8.0"
          unit=""
          progress={phBand.progress}
          state={phBand.state}
        />
        <SanctuaryBand
          label="Air Quality"
          current={airQualityBand.text}
          ideal="50 - 100"
          unit="AQI"
          progress={airQualityBand.progress}
          state={airQualityBand.state}
        />
        <SanctuaryBand
          label="Microphone Noise"
          current={noiseBand.text}
          ideal="20 - 55"
          unit="dB"
          progress={noiseBand.progress}
          state={noiseBand.state}
        />
        <SanctuaryBand
          label="Motion"
          current={motionBand.text}
          ideal={motionBand.ideal}
          unit=""
          progress={motionBand.progress}
          state={motionBand.state}
        />
      </div>
    </article>
  );
}

function SetupPanel() {
  return (
    <section className="rounded-3xl border border-amber-200/30 bg-[linear-gradient(145deg,rgba(250,204,21,0.08),rgba(51,65,85,0.2))] p-6 text-slate-100">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Configuration needed</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Connect Supabase credentials</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200/80">
        Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then
        refresh. Everything else is already wired for realtime monitoring.
      </p>
      <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-medium text-white">Required</p>
          <p className="mt-2 text-slate-300">NEXT_PUBLIC_SUPABASE_URL</p>
          <p className="text-slate-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
          <p className="text-slate-300">NEXT_PUBLIC_DEVICE_ID</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="font-medium text-white">Hardware not needed</p>
          <p className="mt-2 text-slate-300">
            Keep using the simulator script to stream values until the ESP32 is
            available.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [deviceState, setDeviceState] = useState<DeviceStateRow | null>(null);
  const [history, setHistory] = useState<SensorHistoryPoint[]>([]);
  const [noiseHistory, setNoiseHistory] = useState<NoiseHistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [microphoneNoiseLevel, setMicrophoneNoiseLevel] = useState(0);
  const [selectedMetrics, setSelectedMetrics] = useState<SensorMetricKey[]>([
    "temperature",
    "humidity",
    "rain_sensor",
  ]);

  const toggleMetricSelection = (key: SensorMetricKey) => {
    setSelectedMetrics((current) => {
      if (current.includes(key)) {
        return current.length === 1 ? current : current.filter((item) => item !== key);
      }

      return [...current, key];
    });
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // Microphone noise capture using time-domain analysis
  useEffect(() => {
    let stream: MediaStream | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;
    let audioContext: AudioContext | null = null;
    let smoothedNoise = 0;
    let lastCommitAt = 0;

    const initMicrophone = async () => {
      try {
        console.log("🎤 Starting microphone initialization...");
        
        // Request microphone access
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        console.log("✅ Microphone access granted, stream active");

        // Create audio context
        // Create audio context with proper type handling
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioContextClass() as AudioContext;

        // Resume if suspended
        if (audioContext.state === "suspended") {
          console.log("Resuming audio context...");
          await audioContext.resume();
        }

        // Create source with compatibility fallback.
        const ctxAny = audioContext as any;
        const createSourceFn =
          typeof ctxAny.createMediaStreamSource === "function"
            ? ctxAny.createMediaStreamSource.bind(audioContext)
            : typeof ctxAny.createMediaStreamAudioSource === "function"
              ? ctxAny.createMediaStreamAudioSource.bind(audioContext)
              : null;

        if (!createSourceFn) {
          throw new Error("AudioContext does not support MediaStream source creation");
        }

        sourceNode = createSourceFn(stream) as MediaStreamAudioSourceNode;

        // Create script processor for real-time analysis
        processor = audioContext.createScriptProcessor(4096, 1, 1);

        sourceNode.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);

          // Calculate RMS (Root Mean Square) from time-domain data
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);

          // Scale to 0-100 dB range with aggressive scaling
          const normalizedValue = Math.min(100, rms * 2000);

          // Smooth and throttle updates so charts do not rerender every audio callback.
          smoothedNoise = smoothedNoise * 0.82 + normalizedValue * 0.18;
          const nowMs = performance.now();

          if (nowMs - lastCommitAt >= 90) {
            const nextNoise = Number(smoothedNoise.toFixed(1));
            setMicrophoneNoiseLevel(nextNoise);
            setNoiseHistory((current) => {
              const next = [...current, { recordedAt: new Date().toISOString(), noise: nextNoise }];
              return next.slice(-18);
            });
            lastCommitAt = nowMs;
          }
        };

        console.log("📊 Audio processor connected and listening...");
      } catch (err: any) {
        console.error("❌ Microphone Error:", err.name, err.message);
        if (err.name === "NotAllowedError") {
          console.error("User denied microphone permission");
        } else if (err.name === "NotFoundError") {
          console.error("No microphone device found");
        }
        setMicrophoneNoiseLevel(0);
      }
    };

    initMicrophone();

    // Cleanup
    return () => {
      console.log("🛑 Cleaning up microphone...");
      if (processor) {
        processor.disconnect();
      }
      if (sourceNode) {
        sourceNode.disconnect();
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (audioContext) {
        audioContext.close();
      }
    };
  }, []);

  useEffect(() => {
    const supabaseClient = supabase;

    if (!supabaseClient) {
      return;
    }

    let disposed = false;

    const loadCurrentState = async () => {
      const { data, error: loadError } = await supabaseClient
        .from("device_state")
        .select(
          "id, device_id, temperature, humidity, rain_sensor, ph, air_quality, motion_detected, updated_at",
        )
        .eq("device_id", deviceId)
        .maybeSingle();

      if (disposed) {
        return;
      }

      if (loadError) {
        setError(loadError.message);
        return;
      }

      if (data) {
        setDeviceState(data);
        setHistory((current) => pushHistory(current, data));
      }
    };

    void loadCurrentState();

    const handleRealtimeChange = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => {
      const next = payload.new as DeviceStateRow;
      setDeviceState(next);
      setHistory((current) => pushHistory(current, next));
      setError(null);
    };

    const channel = supabaseClient
      .channel(`device-state-${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "device_state",
          filter: `device_id=eq.${deviceId}`,
        },
        handleRealtimeChange,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "device_state",
          filter: `device_id=eq.${deviceId}`,
        },
        handleRealtimeChange,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setError("Realtime subscription failed. Check Supabase Realtime and RLS policies.");
        }
      });

    return () => {
      disposed = true;
      void supabaseClient.removeChannel(channel);
    };
  }, []);

  const online = deviceState?.updated_at
    ? now - new Date(deviceState.updated_at).getTime() <= offlineThresholdSeconds * 1000
    : false;

  const lastSeen = formatLastSeen(deviceState?.updated_at ?? null, now);

  const chartData = useMemo<ChartPoint[]>(() => {
    const shortTime = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const fullDateTime = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const baseData = history.map((point) => {
      const date = new Date(point.recordedAt);
      return {
        time: shortTime.format(date),
        fullTime: fullDateTime.format(date),
        temperature: Number(point.temperature.toFixed(1)),
        humidity: Number(point.humidity.toFixed(1)),
        rain_sensor: Number(point.rain_sensor.toFixed(1)),
        ph: Number(point.ph.toFixed(2)),
        air_quality: Number(point.air_quality.toFixed(0)),
        noise_level: 0,
        motion_detected: point.motion_detected,
        motion_score: point.motion_detected ? 100 : 0,
        motion_activity: point.motion_detected ? 100 : 0,
        temperature_trend: 0,
        humidity_trend: 0,
        rain_sensor_trend: 0,
        ph_trend: 0,
        air_quality_trend: 0,
        noise_level_trend: 0,
        motion_trend: point.motion_detected ? 100 : 0,
      };
    });

    const normalizeByKey = (
      data: ChartPoint[],
      key: "temperature" | "humidity" | "rain_sensor" | "ph" | "air_quality" | "noise_level",
    ) => {
      if (!data.length) {
        return () => 0;
      }

      const values = data.map((item) => item[key]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const delta = max - min;

      if (delta <= 0) {
        return () => 50;
      }

      return (value: number) => Number((((value - min) / delta) * 100).toFixed(0));
    };

    const normalizeTemperature = normalizeByKey(baseData, "temperature");
    const normalizeHumidity = normalizeByKey(baseData, "humidity");
    const normalizeRain = normalizeByKey(baseData, "rain_sensor");
    const normalizePh = normalizeByKey(baseData, "ph");
    const normalizeAirQuality = normalizeByKey(baseData, "air_quality");
    const normalizeNoise = normalizeByKey(baseData, "noise_level");

    return baseData.map((item) => ({
      ...item,
      temperature_trend: normalizeTemperature(item.temperature),
      humidity_trend: normalizeHumidity(item.humidity),
      rain_sensor_trend: normalizeRain(item.rain_sensor),
      ph_trend: normalizePh(item.ph),
      air_quality_trend: normalizeAirQuality(item.air_quality),
      noise_level_trend: normalizeNoise(item.noise_level),
      motion_trend: item.motion_score,
    }));
  }, [history]);

  const motionChartData = useMemo<ChartPoint[]>(() => {
    if (!chartData.length) {
      return [];
    }

    return chartData.map((item, index, items) => {
      const start = Math.max(0, index - 2);
      const window = items.slice(start, index + 1);
      const average = window.reduce((sum, point) => sum + point.motion_score, 0) / window.length;

      return {
        ...item,
        motion_activity: Number(average.toFixed(0)),
      };
    });
  }, [chartData]);

  const noiseChartData = useMemo<ChartPoint[]>(() => {
    const shortTime = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const fullDateTime = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    return noiseHistory.map((point) => {
      const date = new Date(point.recordedAt);

      return {
        time: shortTime.format(date),
        fullTime: fullDateTime.format(date),
        temperature: 0,
        humidity: 0,
        rain_sensor: 0,
        ph: 0,
        air_quality: 0,
        noise_level: point.noise,
        motion_detected: false,
        motion_score: 0,
        motion_activity: 0,
        temperature_trend: 0,
        humidity_trend: 0,
        rain_sensor_trend: 0,
        ph_trend: 0,
        air_quality_trend: 0,
        noise_level_trend: point.noise,
        motion_trend: 0,
      };
    });
  }, [noiseHistory]);

  const recentReadings = useMemo(() => {
    return chartData
      .slice(-10)
      .reverse()
      .map((reading) => ({
        ...reading,
        noise_level: microphoneNoiseLevel,
      }));
  }, [chartData, microphoneNoiseLevel]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_28%),linear-gradient(160deg,#030712_0%,#010611_45%,#02050d_100%)] px-4 py-6 text-slate-100 md:px-8 md:py-10">
      <div className="mx-auto max-w-375">
        <section className="rounded-3xl border border-white/10 bg-[linear-gradient(160deg,rgba(4,12,27,0.92),rgba(2,9,20,0.94))] p-4 md:p-5">
          <HeroSection
            deviceId={deviceId}
            lastSeen={lastSeen}
            online={online}
            offlineThresholdSeconds={offlineThresholdSeconds}
            temperature={formatValue(deviceState?.temperature ?? null, " C")}
            humidity={formatValue(deviceState?.humidity ?? null, " %")}
            rainSensor={formatValue(deviceState?.rain_sensor ?? null, " mm")}
            ph={formatValue(deviceState?.ph ?? null, "")}
            airQuality={formatValue(deviceState?.air_quality ?? null, " AQI")}
            microphoneNoiseLevel={formatValue(microphoneNoiseLevel, " dB")}
            motionDetected={deviceState?.motion_detected ?? null}
          />

          <section className="mt-8">
            <SectionIntro
              anchor="graphs"
              eyebrow="Graphs section"
              title="Live sensor graphs"
              description="Dedicated trend panels for each live environmental stream, so one signal can be inspected clearly before you compare it with the others."
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <ChartPanel
                title="Temperature (24h)"
                subtitle="Realtime and historical"
                unit="C"
                data={chartData}
                dataKey="temperature"
                stroke="#fb7185"
                domain={[0, 45]}
                delay="0.1s"
              />
              <ChartPanel
                title="Humidity (24h)"
                subtitle="Realtime and historical"
                unit="%"
                data={chartData}
                dataKey="humidity"
                stroke="#22d3ee"
                domain={[0, 100]}
                delay="0.18s"
              />
              <ChartPanel
                title="Rain Sensor (24h)"
                subtitle="Realtime and historical"
                unit="mm"
                data={chartData}
                dataKey="rain_sensor"
                stroke="#60a5fa"
                domain={[0, 100]}
                delay="0.26s"
              />
              <ChartPanel
                title="pH (24h)"
                subtitle="Realtime and historical"
                unit="PH"
                data={chartData}
                dataKey="ph"
                stroke="#4ade80"
                domain={[0, 14]}
                delay="0.3s"
              />
              <ChartPanel
                title="Air Quality (24h)"
                subtitle="Realtime and historical"
                unit="AQI"
                data={chartData}
                dataKey="air_quality"
                stroke="#fcd34d"
                delay="0.34s"
              />
              <ChartPanel
                title="Microphone Noise (24h)"
                subtitle="Realtime audio from device microphone"
                unit="dB"
                data={noiseChartData}
                dataKey="noise_level"
                stroke="#c4b5fd"
                domain={[0, 100]}
                delay="0.38s"
                animated={false}
              />
              <MotionPanel data={motionChartData} delay="0.4s" />
            </div>
          </section>

          <section className="mt-8">
            <SectionIntro
              anchor="custom-graphs"
              eyebrow="Custom graphs section"
              title="Build your own sensor comparison"
              description="Select any combination of the seven telemetry streams and generate a focused multi-line comparison view on demand."
            />

            <SelectableMultiPlot
              data={chartData}
              selectedMetrics={selectedMetrics}
              onToggleMetric={toggleMetricSelection}
            />
          </section>

          <section className="mt-8">
            <SectionIntro
              anchor="ecosystem-trend"
              eyebrow="Ecosystem trend (combined)"
              title="All-sensor trend index with motion pulses"
              description="A normalized overview that lets every metric share the same canvas, with motion visualized as an activity pulse instead of a flat boolean."
            />

            <MultiSeriesPanel data={chartData} />
          </section>

          <section className="mt-8">
            <SectionIntro
              anchor="guidance"
              eyebrow="Vedanthangal sanctuary guidance"
              title="Ideal habitat vs current"
              description="Baseline comfort targets for wetland bird-friendly ambient conditions, paired with a presentation-friendly architecture and future-scope summary."
            />

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <SanctuaryPanel
                temperature={deviceState?.temperature ?? null}
                humidity={deviceState?.humidity ?? null}
                ph={deviceState?.ph ?? null}
                rainSensor={deviceState?.rain_sensor ?? null}
                airQuality={deviceState?.air_quality ?? null}
                microphoneNoiseLevel={microphoneNoiseLevel}
                motionDetected={deviceState?.motion_detected ?? null}
              />
              <ArchitectureShowcase />
            </div>
          </section>

          <section className="mt-8">
            <SectionIntro
              anchor="recent-readings"
              eyebrow="Recent readings"
              title="Latest 10 sensor rows"
              description="A compact operational table for quick number-level verification after exploring the trend panels and combined plots above."
            />
            <div className="animate-rise glass-hover rounded-2xl border border-white/10 bg-[linear-gradient(170deg,rgba(5,16,35,0.92),rgba(4,10,24,0.94))] p-5" style={{ animationDelay: "0.42s" }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300/80">Recent readings</p>
                  <p className="text-2xl font-semibold text-white">Latest {recentReadings.length} sensor rows</p>
                </div>
                <p className="text-sm text-slate-400">Local time</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-3 pr-4 font-medium">Time</th>
                      <th className="py-3 pr-4 font-medium">Temperature</th>
                      <th className="py-3 pr-4 font-medium">Humidity</th>
                      <th className="py-3 pr-4 font-medium">Rain Sensor</th>
                      <th className="py-3 pr-4 font-medium">pH</th>
                      <th className="py-3 pr-4 font-medium">Air Quality</th>
                      <th className="py-3 pr-4 font-medium">Microphone Noise</th>
                      <th className="py-3 pr-4 font-medium">Motion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReadings.map((reading, index) => (
                      <tr key={`${reading.fullTime}-${index}`} className="border-b border-white/6 text-slate-200/90">
                        <td className="py-3 pr-4">{reading.time}</td>
                        <td className="py-3 pr-4">{reading.temperature.toFixed(1)} C</td>
                        <td className="py-3 pr-4">{reading.humidity.toFixed(1)} %</td>
                        <td className="py-3 pr-4">{reading.rain_sensor.toFixed(1)} mm</td>
                        <td className="py-3 pr-4">{reading.ph.toFixed(2)}</td>
                        <td className="py-3 pr-4">{reading.air_quality.toFixed(0)} AQI</td>
                        <td className="py-3 pr-4">{reading.noise_level.toFixed(1)} dB</td>
                        <td className="py-3 pr-4">{reading.motion_detected ? "Detected" : "Clear"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {!hasSupabaseConfig ? (
            <div className="mt-7">
              <SetupPanel />
            </div>
          ) : null}

          {error ? (
            <div className="mt-7 rounded-2xl border border-rose-300/25 bg-rose-300/10 p-4 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <SanctuaryFooter />
        </section>
      </div>
    </main>
  );
}