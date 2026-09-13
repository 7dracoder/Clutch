/**
 * Derive small prediction nudges from Tavily / match-intel text.
 * These adjust confidence and base scoring rates — not stake×odds payout math.
 */

export interface NewsPredictionModifiers {
  confidenceModifier: number;
  /** Multiplies base scoringRate / playerShootingRate (e.g. 0.85–1.12). */
  scoringRateMultiplier: number;
  /** Mild scale on attemptProbability after the pitch model runs (e.g. 0.9–1.08). */
  attemptMultiplier: number;
  notes: string[];
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const NEGATIVE_TERMS = [
  "ruled out",
  "sidelined",
  "out for",
  "doubtful",
  "questionable",
  "minutes restriction",
  "limited minutes",
  "injury",
  "injured",
  "suspended",
  "unavailable",
  "miss the",
  "will not play",
  "hamstring",
  "acl",
  "knock",
] as const;

const POSITIVE_TERMS = [
  "available",
  "will play",
  "starting",
  "cleared to play",
  "fit to play",
  "in form",
  "on form",
  "hot streak",
  "returning",
  "back in training",
  "scored",
  "brace",
  "hat-trick",
  "assist",
] as const;

function countTerms(haystack: string, terms: readonly string[]) {
  return terms.reduce(
    (sum, term) => (haystack.includes(term) ? sum + 1 : sum),
    0,
  );
}

export function deriveNewsPredictionModifiers(
  evidence: string | null | undefined,
): NewsPredictionModifiers {
  const text = (evidence ?? "").toLowerCase();
  if (!text.trim()) {
    return {
      confidenceModifier: 0,
      scoringRateMultiplier: 1,
      attemptMultiplier: 1,
      notes: [],
    };
  }

  const negative = countTerms(text, NEGATIVE_TERMS);
  const positive = countTerms(text, POSITIVE_TERMS);
  const notes: string[] = [];

  if (negative > 0) {
    notes.push(
      `News flags ${negative} availability / injury caution signal${negative === 1 ? "" : "s"}`,
    );
  }
  if (positive > 0) {
    notes.push(
      `News flags ${positive} availability / form boost signal${positive === 1 ? "" : "s"}`,
    );
  }

  const confidenceModifier = clamp(
    positive * 0.03 - negative * 0.05,
    -0.2,
    0.08,
  );
  // Injury-heavy copy softens finishing base; form language lifts it slightly.
  const scoringRateMultiplier = clamp(
    1 + positive * 0.025 - negative * 0.045,
    0.78,
    1.12,
  );
  const attemptMultiplier = clamp(
    1 + positive * 0.015 - negative * 0.025,
    0.88,
    1.08,
  );

  return {
    confidenceModifier,
    scoringRateMultiplier,
    attemptMultiplier,
    notes,
  };
}

export function mergeNewsModifiers(
  ...parts: NewsPredictionModifiers[]
): NewsPredictionModifiers {
  return parts.reduce<NewsPredictionModifiers>(
    (acc, part) => ({
      confidenceModifier: clamp(
        acc.confidenceModifier + part.confidenceModifier,
        -0.25,
        0.12,
      ),
      scoringRateMultiplier: clamp(
        acc.scoringRateMultiplier * part.scoringRateMultiplier,
        0.75,
        1.15,
      ),
      attemptMultiplier: clamp(
        acc.attemptMultiplier * part.attemptMultiplier,
        0.85,
        1.1,
      ),
      notes: [...acc.notes, ...part.notes].slice(0, 4),
    }),
    {
      confidenceModifier: 0,
      scoringRateMultiplier: 1,
      attemptMultiplier: 1,
      notes: [],
    },
  );
}

export function evidenceFromMatchIntel(intel: {
  summary?: string;
  injuries?: string;
  playerNews?: string;
  lineup?: string;
  predictionNotes?: string[];
} | null | undefined) {
  if (!intel) return "";
  return [
    intel.summary,
    intel.injuries,
    intel.playerNews,
    intel.lineup,
    ...(intel.predictionNotes ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}
