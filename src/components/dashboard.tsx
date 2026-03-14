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

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildHistoryPoint(row: DeviceStateRow): SensorHistoryPoint | null {
  const temperature = row.temperature;
  const humidity = row.humidity;
  const waterLevel = row.water_level;
  const ph = row.ph;
  const lightIntensity = row.light_intensity;
  const noiseLevel = row.noise_level;
  const motionDetected = row.motion_detected;

  if (
    !isFiniteNumber(temperature) ||
    !isFiniteNumber(humidity) ||
    !isFiniteNumber(waterLevel) ||
    !isFiniteNumber(ph) ||
    !isFiniteNumber(lightIntensity) ||
    !isFiniteNumber(noiseLevel) ||
    typeof motionDetected !== "boolean"
  ) {
    return null;
  }

  return {
    recordedAt: row.updated_at,
    temperature,
    humidity,
    water_level: waterLevel,
    ph,
    light_intensity: lightIntensity,
    noise_level: noiseLevel,
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
  water_level: number;
  ph: number;
  light_intensity: number;
  noise_level: number;
  motion_detected: boolean;
  motion_score: number;
  temperature_trend: number;
  humidity_trend: number;
  water_level_trend: number;
  ph_trend: number;
  light_intensity_trend: number;
  noise_level_trend: number;
  motion_trend: number;
};

type SensorMetricKey =
  | "temperature"
  | "humidity"
  | "water_level"
  | "ph"
  | "light_intensity"
  | "noise_level"
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
  { key: "water_level", label: "Water Level", stroke: "#60a5fa", unit: "%" },
  { key: "ph", label: "pH", stroke: "#4ade80", unit: "pH" },
  { key: "light_intensity", label: "Light", stroke: "#fcd34d", unit: "lx" },
  { key: "noise_level", label: "Noise", stroke: "#c4b5fd", unit: "dB" },
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
  waterLevel,
  ph,
  lightIntensity,
  noiseLevel,
  motionDetected,
}: {
  deviceId: string;
  lastSeen: string;
  online: boolean;
  offlineThresholdSeconds: number;
  temperature: string;
  humidity: string;
  waterLevel: string;
  ph: string;
  lightIntensity: string;
  noiseLevel: string;
  motionDetected: boolean | null;
}) {
  return (
    <section className="animate-rise relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(5,14,31,0.98),rgba(3,11,24,0.96)_42%,rgba(7,24,41,0.96)_100%)] p-6 md:p-8">
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
            A live habitat command surface for temperature, humidity, water level, pH, light,
            noise, and motion, streamed from the field into a realtime dashboard.
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
            <HeroMetric label="Water Level" value={waterLevel} accentClass="bg-blue-400/25" />
            <HeroMetric label="pH" value={ph} accentClass="bg-emerald-400/25" />
            <HeroMetric label="Light Intensity" value={lightIntensity} accentClass="bg-amber-300/25" />
            <HeroMetric label="Noise Level" value={noiseLevel} accentClass="bg-violet-300/25" />
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

function ChartPanel({
  title,
  subtitle,
  unit,
  data,
  dataKey,
  stroke,
  domain,
  delay,
}: {
  title: string;
  subtitle: string;
  unit: string;
  data: ChartPoint[];
  dataKey:
    | "temperature"
    | "humidity"
    | "water_level"
    | "ph"
    | "light_intensity"
    | "noise_level"
    | "motion_score";
  stroke: string;
  domain?: [number, number];
  delay?: string;
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
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={3}
              dot={false}
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
              type="stepAfter"
              dataKey="motion_score"
              stroke="#38bdf8"
              strokeWidth={3}
              dot={false}
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

      <div className="mt-5 h-[30rem]">
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
                  type={option.chartType ?? "monotone"}
                  dataKey={option.key}
                  stroke={option.stroke}
                  strokeWidth={3}
                  dot={false}
                  strokeDasharray={option.key === "motion_score" ? "5 4" : undefined}
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
  return (
    <article className="animate-rise glass-hover rounded-2xl border border-white/10 bg-[linear-gradient(170deg,rgba(5,16,35,0.92),rgba(4,10,24,0.94))] p-5" style={{ animationDelay: "0.35s" }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300/80">Ecosystem trend (combined)</p>
          <p className="text-2xl font-semibold text-white">All-sensor trend index with motion pulses</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-300/80">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            Temperature
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            Humidity
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
            Water
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            pH
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            Light
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-300" />
            Noise
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
            Motion
          </span>
        </div>
      </div>

      <div className="h-107.5">
        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={300}>
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
              formatter={(value, name) => {
                if (name === "motion_trend") {
                  return [Number(value) >= 50 ? "Detected" : "Clear", "motion"];
                }
                return [`${Number(value).toFixed(0)}%`, String(name).replace("_trend", "")];
              }}
            />
            <Line
              type="monotone"
              dataKey="temperature_trend"
              stroke="#fb7185"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#fb7185", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
            <Line
              type="monotone"
              dataKey="humidity_trend"
              stroke="#22d3ee"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
            <Line
              type="monotone"
              dataKey="water_level_trend"
              stroke="#60a5fa"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#60a5fa", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
            <Line
              type="monotone"
              dataKey="ph_trend"
              stroke="#4ade80"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#4ade80", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
            <Line
              type="monotone"
              dataKey="light_intensity_trend"
              stroke="#fcd34d"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#fcd34d", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
            <Line
              type="monotone"
              dataKey="noise_level_trend"
              stroke="#c4b5fd"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#c4b5fd", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
            <Line
              type="stepAfter"
              dataKey="motion_trend"
              stroke="#7dd3fc"
              strokeWidth={3.2}
              dot={false}
              strokeDasharray="5 4"
              activeDot={{ r: 5, fill: "#7dd3fc", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
          </LineChart>
        </ResponsiveContainer>
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
  waterLevel,
}: {
  temperature: number | null;
  humidity: number | null;
  ph: number | null;
  waterLevel: number | null;
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
  const waterBand = rangeProgress(waterLevel, 35, 80);

  return (
    <article className="animate-rise glass-hover rounded-2xl border border-emerald-300/20 bg-[linear-gradient(165deg,rgba(4,26,31,0.84),rgba(3,14,23,0.94))] p-5" style={{ animationDelay: "0.3s" }}>
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
          label="Water Level"
          current={waterBand.text}
          ideal="35 - 80"
          unit="%"
          progress={waterBand.progress}
          state={waterBand.state}
        />
        <SanctuaryBand
          label="pH"
          current={phBand.text}
          ideal="6.5 - 8.0"
          unit=""
          progress={phBand.progress}
          state={phBand.state}
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
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedMetrics, setSelectedMetrics] = useState<SensorMetricKey[]>([
    "temperature",
    "humidity",
    "water_level",
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
          "id, device_id, temperature, humidity, water_level, ph, light_intensity, noise_level, motion_detected, updated_at",
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
        water_level: Number(point.water_level.toFixed(1)),
        ph: Number(point.ph.toFixed(2)),
        light_intensity: Number(point.light_intensity.toFixed(0)),
        noise_level: Number(point.noise_level.toFixed(1)),
        motion_detected: point.motion_detected,
        motion_score: point.motion_detected ? 100 : 0,
        temperature_trend: 0,
        humidity_trend: 0,
        water_level_trend: 0,
        ph_trend: 0,
        light_intensity_trend: 0,
        noise_level_trend: 0,
        motion_trend: point.motion_detected ? 100 : 0,
      };
    });

    const normalizeByKey = (
      data: ChartPoint[],
      key: "temperature" | "humidity" | "water_level" | "ph" | "light_intensity" | "noise_level",
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
    const normalizeWater = normalizeByKey(baseData, "water_level");
    const normalizePh = normalizeByKey(baseData, "ph");
    const normalizeLight = normalizeByKey(baseData, "light_intensity");
    const normalizeNoise = normalizeByKey(baseData, "noise_level");

    return baseData.map((item) => ({
      ...item,
      temperature_trend: normalizeTemperature(item.temperature),
      humidity_trend: normalizeHumidity(item.humidity),
      water_level_trend: normalizeWater(item.water_level),
      ph_trend: normalizePh(item.ph),
      light_intensity_trend: normalizeLight(item.light_intensity),
      noise_level_trend: normalizeNoise(item.noise_level),
      motion_trend: item.motion_score,
    }));
  }, [history]);

  const recentReadings = useMemo(() => {
    return chartData.slice(-10).reverse();
  }, [chartData]);

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
            waterLevel={formatValue(deviceState?.water_level ?? null, " %")}
            ph={formatValue(deviceState?.ph ?? null, "")}
            lightIntensity={formatValue(deviceState?.light_intensity ?? null, " lx")}
            noiseLevel={formatValue(deviceState?.noise_level ?? null, " dB")}
            motionDetected={deviceState?.motion_detected ?? null}
          />

          <section className="mt-6 grid gap-4 xl:grid-cols-2">
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
              title="Water Level (24h)"
              subtitle="Realtime and historical"
              unit="%"
              data={chartData}
              dataKey="water_level"
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
              title="Light Intensity (24h)"
              subtitle="Realtime and historical"
              unit="LX"
              data={chartData}
              dataKey="light_intensity"
              stroke="#fcd34d"
              delay="0.34s"
            />
            <ChartPanel
              title="Noise Level (24h)"
              subtitle="Realtime and historical"
              unit="DB"
              data={chartData}
              dataKey="noise_level"
              stroke="#c4b5fd"
              delay="0.38s"
            />
            <MotionPanel data={chartData} delay="0.4s" />
            <SanctuaryPanel
              temperature={deviceState?.temperature ?? null}
              humidity={deviceState?.humidity ?? null}
              ph={deviceState?.ph ?? null}
              waterLevel={deviceState?.water_level ?? null}
            />
          </section>

          <section className="mt-6">
            <SelectableMultiPlot
              data={chartData}
              selectedMetrics={selectedMetrics}
              onToggleMetric={toggleMetricSelection}
            />
          </section>

          <section className="mt-6">
            <MultiSeriesPanel data={chartData} />
          </section>

          <section className="animate-rise glass-hover mt-6 rounded-2xl border border-white/10 bg-[linear-gradient(170deg,rgba(5,16,35,0.92),rgba(4,10,24,0.94))] p-5" style={{ animationDelay: "0.42s" }}>
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
                    <th className="py-3 pr-4 font-medium">Water</th>
                    <th className="py-3 pr-4 font-medium">pH</th>
                    <th className="py-3 pr-4 font-medium">Light</th>
                    <th className="py-3 pr-4 font-medium">Noise</th>
                    <th className="py-3 pr-4 font-medium">Motion</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReadings.map((reading, index) => (
                    <tr key={`${reading.fullTime}-${index}`} className="border-b border-white/6 text-slate-200/90">
                      <td className="py-3 pr-4">{reading.time}</td>
                      <td className="py-3 pr-4">{reading.temperature.toFixed(1)} C</td>
                      <td className="py-3 pr-4">{reading.humidity.toFixed(1)} %</td>
                      <td className="py-3 pr-4">{reading.water_level.toFixed(1)} %</td>
                      <td className="py-3 pr-4">{reading.ph.toFixed(2)}</td>
                      <td className="py-3 pr-4">{reading.light_intensity.toFixed(0)} lx</td>
                      <td className="py-3 pr-4">{reading.noise_level.toFixed(1)} dB</td>
                      <td className="py-3 pr-4">{reading.motion_detected ? "Detected" : "Clear"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        </section>
      </div>
    </main>
  );
}