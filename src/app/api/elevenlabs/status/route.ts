import { NextResponse } from "next/server";
import { isElevenLabsConfigured } from "@/integrations/elevenlabs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const roleParam = new URL(request.url).searchParams.get("role");
  const role = roleParam === "personal" ? "personal" : "treasury";
  return NextResponse.json({
    configured: isElevenLabsConfigured(role),
    role,
    treasuryConfigured: isElevenLabsConfigured("treasury"),
    personalConfigured: isElevenLabsConfigured("personal"),
  });
}
