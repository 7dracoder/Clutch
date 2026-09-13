import {
  deletePhoneStream,
  getPhoneFrame,
  isValidPhoneRoom,
  putPhoneFrame,
} from "@/lib/phone-stream-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FRAME_BYTES = 2_000_000;

interface RouteContext {
  params: Promise<{ room: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { room } = await context.params;
  if (!isValidPhoneRoom(room)) {
    return Response.json({ error: "Invalid phone room" }, { status: 400 });
  }
  if (!request.headers.get("content-type")?.startsWith("image/jpeg")) {
    return Response.json({ error: "JPEG frame required" }, { status: 415 });
  }

  const licenseNote = decodeHeader(request.headers.get("x-clutch-license"));
  if (!licenseNote.trim()) {
    return Response.json(
      { error: "Footage license or permission note required" },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FRAME_BYTES) {
    return Response.json(
      { error: `Frame must be between 1 and ${MAX_FRAME_BYTES} bytes` },
      { status: 413 },
    );
  }

  const sequence = parseInteger(request.headers.get("x-clutch-sequence"));
  const timestampMs = parseInteger(request.headers.get("x-clutch-timestamp"));
  putPhoneFrame(room, {
    bytes,
    sequence,
    timestampMs,
    sourceUrl: decodeHeader(request.headers.get("x-clutch-source")),
    licenseNote,
    updatedAtMs: Date.now(),
  });

  return Response.json({ accepted: true, sequence }, { status: 202 });
}

export async function GET(request: Request, context: RouteContext) {
  const { room } = await context.params;
  if (!isValidPhoneRoom(room)) {
    return Response.json({ error: "Invalid phone room" }, { status: 400 });
  }

  const after = parseInteger(new URL(request.url).searchParams.get("after"), -1);
  const frame = getPhoneFrame(room);
  if (!frame || frame.sequence <= after) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(frame.bytes.slice().buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Clutch-Sequence": String(frame.sequence),
      "X-Clutch-Timestamp": String(frame.timestampMs),
      "X-Clutch-Source": encodeHeader(frame.sourceUrl),
      "X-Clutch-License": encodeHeader(frame.licenseNote),
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { room } = await context.params;
  if (!isValidPhoneRoom(room)) {
    return Response.json({ error: "Invalid phone room" }, { status: 400 });
  }
  deletePhoneStream(room);
  return new Response(null, { status: 204 });
}

function parseInteger(value: string | null, fallback = 0) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= fallback ? parsed : fallback;
}

function decodeHeader(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeHeader(value: string) {
  return encodeURIComponent(value).slice(0, 1_000);
}
