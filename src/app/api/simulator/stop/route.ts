import { NextResponse } from "next/server";
import { stopSimulator, isSimulatorRunning } from "../../../../lib/simulator";

export async function POST() {
  try {
    if (!isSimulatorRunning()) {
      return NextResponse.json({ ok: true, message: "not running" });
    }

    const stopped = stopSimulator();
    return NextResponse.json({ ok: stopped });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
