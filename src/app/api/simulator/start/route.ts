import { NextResponse } from "next/server";
import { startSimulator, isSimulatorRunning } from "../../../../lib/simulator";

export async function POST(request: Request) {
  try {
    if (isSimulatorRunning()) {
      return NextResponse.json({ ok: true, message: "already running" });
    }

    const body = await request.json().catch(() => ({}));
    const env = body.env ?? {};

    const pid = startSimulator(env);

    return NextResponse.json({ ok: true, pid });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
