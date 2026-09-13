import { NextResponse } from "next/server";
import { createContentPack } from "@/application/create-content-pack";
import {
  playerContextSchema,
  riskAssessmentSchema,
} from "@/domain/types";
import { z } from "zod";

const requestSchema = z.object({
  risk: riskAssessmentSchema,
  playerContext: playerContextSchema.optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    return NextResponse.json(await createContentPack(input));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Content generation failed";
    const status = message.includes("configured") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
