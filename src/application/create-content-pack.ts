import { z } from "zod";
import type { PlayerContext, RiskAssessment } from "@/domain/types";

const contentPackSchema = z.object({
  linkedInPost: z.string(),
  xPost: z.string(),
  instagramCaption: z.string(),
  shortVideoScript: z.string(),
  narration: z.string(),
  chartHeadline: z.string(),
  sourceUrls: z.array(z.string().url()),
  callToAction: z.string(),
  stanProductUrl: z.string().url(),
});

export type ContentPack = z.infer<typeof contentPackSchema>;

export async function createContentPack(input: {
  risk: RiskAssessment;
  playerContext?: PlayerContext;
}): Promise<ContentPack> {
  const apiKey = process.env.BASETEN_API_KEY;
  const stanProductUrl = process.env.NEXT_PUBLIC_STAN_PRODUCT_URL;
  if (!apiKey) throw new Error("BASETEN_API_KEY is not configured");
  if (!stanProductUrl) {
    throw new Error("NEXT_PUBLIC_STAN_PRODUCT_URL is not configured");
  }

  const response = await fetch(
    "https://inference.baseten.co/v1/chat/completions",
    {
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
            content:
              "Create factual sports-finance educational content. Never present a prediction as certainty, gambling advice, or guaranteed financial performance. Return only JSON.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Create a Clutch multi-channel creator pack",
              risk: input.risk,
              context: input.playerContext,
              stanProductUrl,
            }),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 1_600,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Baseten content request failed with status ${response.status}`,
    );
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Baseten returned no creator content");

  return contentPackSchema.parse({
    ...JSON.parse(content),
    stanProductUrl,
    sourceUrls:
      input.playerContext?.sources.map((source) => source.url) ?? [],
  });
}
