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
  const gas = row.gas;

  if (
    !isFiniteNumber(temperature) ||
    !isFiniteNumber(humidity) ||
    !isFiniteNumber(gas)
  ) {
    return null;
  }

  return {
    recordedAt: row.updated_at,
    temperature,
    humidity,
    gas,
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
  gas: number;
};

function SensorCard({
  title,
  value,
  subtext,
  colorClass,
  delay,
}: {
  title: string;
  value: string;
  subtext: string;
  colorClass: string;
  delay?: string;
}) {
  return (
    <article
      className="animate-rise glass-hover relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(165deg,rgba(8,20,40,0.86),rgba(5,10,24,0.9))] p-5 shadow-[0_12px_40px_rgba(2,6,23,0.45)]"
      style={delay ? { animationDelay: delay } : undefined}
    >
      <div className={`pointer-events-none absolute -right-14 -top-12 h-32 w-32 rounded-full blur-3xl ${colorClass}`} />
      <p className="text-sm text-slate-300/80">{title}</p>
      <p className="mt-2 text-5xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{subtext}</p>
    </article>
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
  dataKey: "temperature" | "humidity" | "gas";
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

function MultiSeriesPanel({ data }: { data: ChartPoint[] }) {
  return (
    <article className="animate-rise glass-hover rounded-2xl border border-white/10 bg-[linear-gradient(170deg,rgba(5,16,35,0.92),rgba(4,10,24,0.94))] p-5" style={{ animationDelay: "0.35s" }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300/80">Ecosystem trend (combined)</p>
          <p className="text-2xl font-semibold text-white">Temperature, humidity, and gas</p>
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
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            Gas
          </span>
        </div>
      </div>

      <div className="h-[430px]">
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
            />
            <Line
              type="monotone"
              dataKey="temperature"
              stroke="#fb7185"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#fb7185", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
            <Line
              type="monotone"
              dataKey="humidity"
              stroke="#22d3ee"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 2 }}
              className="chart-line-flow"
            />
            <Line
              type="monotone"
              dataKey="gas"
              stroke="#fcd34d"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "#fcd34d", stroke: "#0f172a", strokeWidth: 2 }}
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
  gas,
}: {
  temperature: number | null;
  humidity: number | null;
  gas: number | null;
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

  const maxOnlyProgress = (
    value: number | null,
    max: number,
  ): { progress: number; state: "good" | "warn"; text: string } => {
    if (!isFiniteNumber(value)) {
      return { progress: 0, state: "warn" as const, text: "--" };
    }

    const normalized = (value / max) * 100;
    const progress = Math.max(0, Math.min(100, normalized));
    const state: "good" | "warn" = value <= max ? "good" : "warn";
    return { progress, state, text: value.toFixed(1) };
  };

  const humidityBand = rangeProgress(humidity, 55, 75);
  const temperatureBand = rangeProgress(temperature, 24, 32);
  const gasBand = maxOnlyProgress(gas, 130);

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
          label="Gas"
          current={gasBand.text}
          ideal="<= 130"
          unit="ppm"
          progress={gasBand.progress}
          state={gasBand.state}
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
        .select("id, device_id, temperature, humidity, gas, updated_at")
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

  const online = useMemo(() => {
    if (!deviceState?.updated_at) {
      return false;
    }

    return now - new Date(deviceState.updated_at).getTime() <= offlineThresholdSeconds * 1000;
  }, [deviceState?.updated_at, now]);

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

    return history.map((point) => {
      const date = new Date(point.recordedAt);
      return {
        time: shortTime.format(date),
        fullTime: fullDateTime.format(date),
        temperature: Number(point.temperature.toFixed(1)),
        humidity: Number(point.humidity.toFixed(1)),
        gas: Number(point.gas.toFixed(1)),
      };
    });
  }, [history]);

  const recentReadings = useMemo(() => {
    return chartData.slice(-10).reverse();
  }, [chartData]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_28%),linear-gradient(160deg,#030712_0%,#010611_45%,#02050d_100%)] px-4 py-6 text-slate-100 md:px-8 md:py-10">
      <div className="mx-auto max-w-[1500px]">
        <section className="animate-rise rounded-3xl border border-white/10 bg-[linear-gradient(160deg,rgba(4,12,27,0.92),rgba(2,9,20,0.94))] p-6 md:p-8">
          <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-5xl font-semibold tracking-tight text-white">Vedanthangal Ecosystem Monitoring</h1>
              <p className="mt-2 text-lg text-slate-300">ESP32, DHT22, Supabase, Realtime</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[#071325] px-4 py-3">
                <p className="text-xs text-slate-400">Device</p>
                <p className="mt-1 text-lg font-medium text-white">{deviceId}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#071325] px-4 py-3">
                <p className="text-xs text-slate-400">Last update</p>
                <p className="mt-1 text-lg font-medium text-white">{lastSeen}</p>
              </div>
            </div>
          </header>

          <section className="mt-6 grid gap-4 lg:grid-cols-3">
            <SensorCard
              title="Temperature"
              value={formatValue(deviceState?.temperature ?? null, "")}
              subtext="Current reading"
              colorClass="bg-rose-400/30"
              delay="0.08s"
            />
            <SensorCard
              title="Humidity"
              value={formatValue(deviceState?.humidity ?? null, "")}
              subtext="Current reading"
              colorClass="bg-cyan-400/30"
              delay="0.16s"
            />
            <article className="animate-rise glass-hover rounded-2xl border border-white/10 bg-[linear-gradient(165deg,rgba(8,20,40,0.86),rgba(5,10,24,0.9))] p-5 shadow-[0_12px_40px_rgba(2,6,23,0.45)]" style={{ animationDelay: "0.24s" }}>
              <p className="text-sm text-slate-300/80">Device Status</p>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`}
                />
                <p className={`text-2xl font-semibold ${online ? "text-emerald-300" : "text-rose-300"}`}>
                  {online ? "Online" : "Offline"}
                </p>
              </div>
              <p className="mt-2 text-sm text-slate-400">Threshold {offlineThresholdSeconds}s</p>
              <p className="mt-2 text-sm text-slate-400">Gas {formatValue(deviceState?.gas ?? null, " ppm")}</p>
            </article>
          </section>

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
              title="Gas (24h)"
              subtitle="Realtime and historical"
              unit="PPM"
              data={chartData}
              dataKey="gas"
              stroke="#fcd34d"
              delay="0.26s"
            />
            <SanctuaryPanel
              temperature={deviceState?.temperature ?? null}
              humidity={deviceState?.humidity ?? null}
              gas={deviceState?.gas ?? null}
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
                    <th className="py-3 pr-4 font-medium">Gas</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReadings.map((reading, index) => (
                    <tr key={`${reading.fullTime}-${index}`} className="border-b border-white/6 text-slate-200/90">
                      <td className="py-3 pr-4">{reading.time}</td>
                      <td className="py-3 pr-4">{reading.temperature.toFixed(1)} C</td>
                      <td className="py-3 pr-4">{reading.humidity.toFixed(1)} %</td>
                      <td className="py-3 pr-4">{reading.gas.toFixed(1)} ppm</td>
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