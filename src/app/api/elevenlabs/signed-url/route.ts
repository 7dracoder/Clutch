import { NextResponse } from "next/server";
import { getElevenLabsSignedUrl } from "@/integrations/elevenlabs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const roleParam = new URL(request.url).searchParams.get("role");
    const role = roleParam === "personal" ? "personal" : "treasury";
    return NextResponse.json({
      signedUrl: await getElevenLabsSignedUrl(role),
      role,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Signed URL request failed";
    const status = message.includes("configured") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
