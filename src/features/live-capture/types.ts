import { z } from "zod";

export const trackedObjectSchema = z.object({
  id: z.string(),
  kind: z.enum(["player", "ball", "official", "other"]),
  role: z
    .enum(["player", "ball", "referee", "goalkeeper", "other"])
    .optional(),
  team: z.enum(["offense", "defense", "unknown"]).optional(),
  videoPoint: z.object({ x: z.number(), y: z.number() }),
  fieldPoint: z.object({ x: z.number(), y: z.number() }).optional(),
  confidence: z.number().min(0).max(1),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export const trackingFrameSchema = z.object({
  type: z.literal("tracking"),
  sport: z.enum(["basketball", "soccer"]).optional(),
  sessionId: z.string(),
  sequence: z.number().int().nonnegative(),
  timestampMs: z.number(),
  processedAtMs: z.number(),
  frame: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  objects: z.array(trackedObjectSchema),
  calibrated: z.boolean(),
  source: z
    .object({
      sourceUrl: z.string(),
      licenseNote: z.string(),
    })
    .optional(),
});

export type TrackingFrame = z.infer<typeof trackingFrameSchema>;

export interface CalibrationPoint {
  video: { x: number; y: number };
  field: { x: number; y: number };
}

export interface CaptureSource {
  sourceUrl: string;
  licenseNote: string;
}

export type CaptureStatus =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "observing"
  | "stopped"
  | "error";
