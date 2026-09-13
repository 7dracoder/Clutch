import { z } from "zod";
import { researchSourceSchema } from "@/domain/types";

export const slateSports = [
  "soccer",
  "basketball",
  "american_football",
  "tennis",
  "mma",
  "motorsport",
  "baseball",
  "hockey",
] as const;

export type SlateSport = (typeof slateSports)[number];

export const slateEventStatusSchema = z.enum(["live", "upcoming", "final"]);

export const slateCompetitorSchema = z.object({
  name: z.string(),
  abbreviation: z.string().optional(),
  logoUrl: z.string().url().optional(),
  score: z.string().optional(),
});

export const slateEventSchema = z.object({
  id: z.string(),
  sport: z.enum(slateSports),
  competition: z.string(),
  status: slateEventStatusSchema,
  startAt: z.string(),
  detail: z.string(),
  headline: z.string().optional(),
  venue: z.string().optional(),
  home: slateCompetitorSchema,
  away: slateCompetitorSchema,
  source: z.enum(["scoreboard", "tavily"]),
});

export const eventIntelRequestSchema = z.object({
  id: z.string().trim().min(1).max(120),
  sport: z.enum(slateSports),
  home: z.string().trim().min(1).max(80),
  away: z.string().trim().min(1).max(80),
  competition: z.string().trim().min(1).max(80).optional(),
  status: slateEventStatusSchema.optional(),
});

export const eventIntelSchema = z.object({
  query: z.string(),
  summary: z.string(),
  lineup: z.string(),
  injuries: z.string(),
  playerNews: z.string(),
  commentary: z.string(),
  liveScore: z
    .object({
      home: z.string(),
      away: z.string(),
      detail: z.string(),
      source: z.literal("api_football"),
    })
    .optional(),
  predictionNotes: z.array(z.string()),
  sources: z.array(researchSourceSchema),
  images: z.array(
    z.object({
      url: z.string().url(),
      description: z.string(),
    }),
  ),
  fetchedAt: z.string(),
});

export type SlateEvent = z.infer<typeof slateEventSchema>;
export type EventIntelRequest = z.infer<typeof eventIntelRequestSchema>;
export type EventIntel = z.infer<typeof eventIntelSchema>;
