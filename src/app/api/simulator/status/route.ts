import { NextResponse } from "next/server";
import { isSimulatorRunning } from "../../../../lib/simulator";

export async function GET() {
  try {
    return NextResponse.json({ running: isSimulatorRunning() });
  } catch (err: any) {
    return NextResponse.json({ running: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
