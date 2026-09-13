import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const workerUrl = process.env.VISION_WORKER_HTTP_URL ?? "http://127.0.0.1:8765";
  try {
    const response = await fetch(`${workerUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) throw new Error(`Worker returned ${response.status}`);
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      {
        status: "offline",
        sport: "soccer",
        detector: "unavailable",
        device: "unavailable",
        modelReady: false,
        researchOnly: false,
      },
      { status: 503 },
    );
  }
}
