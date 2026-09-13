import { NextResponse } from "next/server";
import { soccerDemoTimeline } from "@/data/soccer-demo";

export function GET() {
  return NextResponse.json({
    adapter: "soccer",
    timeline: soccerDemoTimeline,
  });
}
