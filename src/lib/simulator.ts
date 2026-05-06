import { spawn, ChildProcess } from "child_process";
import path from "path";

let proc: ChildProcess | null = null;

export function isSimulatorRunning() {
  return !!proc && !proc.killed;
}

export function startSimulator(envOverrides: Record<string, string> = {}) {
  if (isSimulatorRunning()) {
    throw new Error("Simulator already running");
  }

  const scriptPath = path.resolve(process.cwd(), "scripts", "simulate-sensor.mjs");

  const child = spawn(process.execPath, [scriptPath], {
    env: { ...process.env, ...envOverrides },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (d) => {
    console.log(`[simulator stdout] ${String(d).trim()}`);
  });
  child.stderr?.on("data", (d) => {
    console.error(`[simulator stderr] ${String(d).trim()}`);
  });
  child.on("exit", (code, signal) => {
    console.log(`[simulator] exited code=${code} signal=${signal}`);
    if (proc === child) proc = null;
  });

  proc = child;
  return child.pid ?? null;
}

export function stopSimulator() {
  if (!isSimulatorRunning()) {
    return false;
  }

  try {
    proc?.kill("SIGTERM");
  } catch (err) {
    try {
      proc?.kill();
    } catch {}
  }

  proc = null;
  return true;
}
