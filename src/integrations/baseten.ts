import { courtStateSchema, type CourtState } from "@/domain/types";

const BASETEN_URL = "https://inference.baseten.co/v1/chat/completions";

interface FrameAnalysisInput {
  imageUrl: string;
  timestampMs: number;
}

export function analyzeBasketballFrame(
  input: FrameAnalysisInput,
): Promise<CourtState> {
  return analyzeSportsFrame({ ...input, sport: "basketball" });
}

export function analyzeSoccerFrame(
  input: FrameAnalysisInput,
): Promise<CourtState> {
  return analyzeSportsFrame({ ...input, sport: "soccer" });
}

export async function analyzeSportsFrame(input: FrameAnalysisInput & {
  sport: "basketball" | "soccer";
}): Promise<CourtState> {
  const apiKey = process.env.BASETEN_API_KEY;
  if (!apiKey) throw new Error("BASETEN_API_KEY is not configured");

  const soccer = input.sport === "soccer";
  const distanceField = soccer
    ? "defenderDistanceMeters"
    : "defenderDistanceFeet";
  const sportFields = soccer
    ? {
        defenderDistanceMeters: { type: "number", minimum: 0 },
        attackingDirection: { type: "string", enum: ["left", "right"] },
        teamInPossession: {
          type: "string",
          enum: ["offense", "defense", "unknown"],
        },
        matchClockSeconds: { type: ["number", "null"], minimum: 0 },
      }
    : {
        defenderDistanceFeet: { type: "number", minimum: 0 },
        shotClockSeconds: { type: ["number", "null"], minimum: 0 },
      };

  const response = await fetch(BASETEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.BASETEN_MODEL ?? "moonshotai/Kimi-K2.6",
      messages: [
        {
          role: "system",
          content: soccer
            ? "Analyze only visible association-football evidence. Return JSON. Do not identify people. Infer pitch zone, possession, nearest-opponent distance in meters, goalward movement, and likely action. Use shot_on_goal, cross, progressive_pass, or off_ball_run and express uncertainty honestly."
            : "Analyze only visible basketball evidence. Return JSON, avoid player identity claims, and express uncertainty honestly.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this ${input.sport} frame at ${input.timestampMs} ms. Return the visible field state only.`,
            },
            { type: "image_url", image_url: { url: input.imageUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: `${input.sport}_field_state`,
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "sport",
              "timestampMs",
              "courtZone",
              "hasPossession",
              distanceField,
              "movementTowardZone",
              "likelyAction",
              "visualConfidence",
              ...(soccer
                ? ["attackingDirection", "teamInPossession"]
                : []),
            ],
            properties: {
              sport: { type: "string", enum: [input.sport] },
              timestampMs: { type: "integer", minimum: 0 },
              courtZone: { type: "string" },
              hasPossession: { type: "boolean" },
              movementTowardZone: { type: "boolean" },
              likelyAction: { type: "string" },
              visualConfidence: { type: "number", minimum: 0, maximum: 1 },
              ...sportFields,
            },
          },
        },
      },
      temperature: 0.1,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Baseten request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Baseten returned no structured field state");

  const parsed = JSON.parse(content) as Record<string, unknown>;
  if (parsed.shotClockSeconds === null) delete parsed.shotClockSeconds;
  if (parsed.matchClockSeconds === null) delete parsed.matchClockSeconds;
  return courtStateSchema.parse(parsed);
}
