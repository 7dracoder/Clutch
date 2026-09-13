export const PERSONAL_BETTING_ANALYST_NAME = "Clutch Personal Betting Analyst";

export const PERSONAL_BETTING_ANALYST_FIRST_MESSAGE =
  "Personal mode is on. I will follow the system lead and your linked Rho bankroll for bet sizing talk. I never place a wager for you — I only advise. What should we check?";

export const PERSONAL_BETTING_ANALYST_VARIABLE_KEYS = [
  "fixture",
  "sport",
  "lead_side",
  "lead_strength",
  "lead_stance",
  "lead_headline",
  "lead_blurb",
  "lead_reasons",
  "live_finish_probability",
  "attempt_probability",
  "prediction_confidence",
  "predicted_event",
  "court_zone",
  "team_in_possession",
  "rho_checking_balance",
  "rho_pending_outflows",
  "rho_safe_cash",
  "suggested_stake_band",
  "match_lineup",
  "match_injuries",
  "match_news",
  "match_commentary",
  "detection_source",
] as const;

export const PERSONAL_BETTING_ANALYST_PROMPT = `You are the Clutch Personal Betting Analyst. The operator is in Personal mode — they want help interpreting Clutch system leads for their own bets.

Speak like a sharp betting desk partner: concise, clear, no hype. Lead with one short answer, then 1–2 numbers. Ask one follow-up only when it helps them decide. Do not monologue.

Critical rules:
- Decision support only. Never claim you placed a bet, confirmed a sportsbook ticket, or moved production money.
- Never invent odds, scores, or guaranteed winners.
- Use only injected live variables. Prefer the system lead (side, strength, stance) plus live finish/attempt/confidence.
- Rho numbers are the SAME sandbox accounts used by Treasury mode — treat them as linked bankroll context for sizing talk, not as a sportsbook wallet API.
- If lead_stance is Pass or confidence is weak, say so plainly and discourage forcing a bet.
- If they ask to place a bet, explain you can only log a personal bet intent against the linked Rho sandbox ledger for tracking — they still place the real wager themselves.

Current personal briefing:
- Fixture: {{fixture}}
- Sport: {{sport}}
- System lead side: {{lead_side}}
- Lead strength: {{lead_strength}}
- Stance (Lean / Watch / Pass): {{lead_stance}}
- Lead headline: {{lead_headline}}
- Lead blurb: {{lead_blurb}}
- Lead reasons: {{lead_reasons}}
- Live finish probability: {{live_finish_probability}}
- Attempt probability: {{attempt_probability}}
- Prediction confidence: {{prediction_confidence}}
- Predicted event: {{predicted_event}}
- Pitch zone: {{court_zone}}
- Team in possession: {{team_in_possession}}
- Rho checking balance (linked): {{rho_checking_balance}}
- Rho pending outflows (linked): {{rho_pending_outflows}}
- Rho safe cash (linked): {{rho_safe_cash}}
- Suggested stake band: {{suggested_stake_band}}
- Squad / lineup: {{match_lineup}}
- Injuries: {{match_injuries}}
- Player news: {{match_news}}
- Commentary: {{match_commentary}}
- Detection source: {{detection_source}}

How to answer:
- "Who should I lean?" → lead_side + lead_strength + stance, then compare to their price verbally (you do not know their sportsbook price unless they say it).
- "How much should I risk?" → use suggested_stake_band and Rho safe cash; never exceed a tiny fraction of bankroll in advice.
- "Why this lead?" → lead_reasons + live finish/attempt/confidence.
- Match research questions → call searchMatchContext, then cite sources.

Client tools:
- openRhoBankroll: focus the linked Rho ledger / bankroll panel (same accounts as Treasury)
- focusLiveCourt: focus the live pitch twin
- showPersonalLead: focus the personal lead / exposure panel
- searchMatchContext: fetch match intel. Arguments: query (required), optional team, optional competition
- explainPersonalLead: return a spoken summary of the current system lead (no UI-only navigation)
- logPersonalBetIntent: log a sandbox personal bet intent against the linked Rho ledger. Arguments: side (string), stake_dollars (number), note (optional string). Does not place a real sportsbook bet.

Focus tools only when the user asks to see / show a panel. For describe/explain questions, speak from variables or explainPersonalLead.`;

export const personalBettingAnalystToolDefinitions = [
  {
    name: "openRhoBankroll",
    description:
      "Focus the linked Rho bankroll / ledger panel. Same sandbox accounts as Treasury mode. Only when asked to show bankroll.",
    expects_response: false,
    parameters: {
      type: "object",
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "focusLiveCourt",
    description:
      "Focus the live pitch twin when the operator asks to see tracking.",
    expects_response: false,
    parameters: {
      type: "object",
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "showPersonalLead",
    description:
      "Focus the personal lead panel when the operator asks to see the lead breakdown.",
    expects_response: false,
    parameters: {
      type: "object",
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "searchMatchContext",
    description:
      "Search Tavily for match preview, injuries, or context. Do not invent results.",
    expects_response: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Research question." },
        team: { type: "string", description: "Optional team name." },
        competition: {
          type: "string",
          description: "Optional competition name.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "explainPersonalLead",
    description:
      "Return a spoken summary of the current system lead for personal betting. Speak the result aloud.",
    expects_response: true,
    parameters: {
      type: "object",
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "logPersonalBetIntent",
    description:
      "Log a personal bet intent on the linked Rho sandbox ledger for tracking. Does not place a sportsbook bet or move production cash.",
    expects_response: true,
    parameters: {
      type: "object",
      properties: {
        side: {
          type: "string",
          description: "Side or market the person intends to back.",
        },
        stake_dollars: {
          type: "number",
          description: "Intended stake in dollars.",
        },
        note: {
          type: "string",
          description: "Optional short note.",
        },
      },
      required: ["side", "stake_dollars"],
    },
  },
] as const;

export function personalBriefingPlaceholderDefaults() {
  return Object.fromEntries(
    PERSONAL_BETTING_ANALYST_VARIABLE_KEYS.map((key) => [key, "unknown"]),
  );
}

export function createPersonalBettingAnalystConversationConfig(
  toolIds: string[],
) {
  return {
    turn: {
      turn_timeout: 20,
      turn_eagerness: "patient",
      silence_end_call_timeout: -1,
      soft_timeout_config: {
        timeout_seconds: -1,
      },
    },
    conversation: {
      client_events: [
        "conversation_initiation_metadata",
        "audio",
        "user_transcript",
        "agent_response",
        "agent_response_correction",
        "client_tool_call",
        "agent_tool_response",
        "agent_chat_response_part",
      ],
    },
    agent: {
      first_message: PERSONAL_BETTING_ANALYST_FIRST_MESSAGE,
      language: "en",
      disable_first_message_interruptions: true,
      prompt: {
        prompt: PERSONAL_BETTING_ANALYST_PROMPT,
        llm: "gemini-2.0-flash",
        temperature: 0.45,
        max_tokens: -1,
        tool_ids: toolIds,
      },
      dynamic_variables: {
        dynamic_variable_placeholders: personalBriefingPlaceholderDefaults(),
      },
    },
  };
}

export function createLegacyPersonalBettingAnalystConversationConfig() {
  return {
    turn: {
      turn_timeout: 20,
      turn_eagerness: "patient",
      silence_end_call_timeout: -1,
      soft_timeout_config: {
        timeout_seconds: -1,
      },
    },
    conversation: {
      client_events: [
        "conversation_initiation_metadata",
        "audio",
        "user_transcript",
        "agent_response",
        "agent_response_correction",
        "client_tool_call",
        "agent_tool_response",
        "agent_chat_response_part",
      ],
    },
    agent: {
      first_message: PERSONAL_BETTING_ANALYST_FIRST_MESSAGE,
      language: "en",
      disable_first_message_interruptions: true,
      prompt: {
        prompt: PERSONAL_BETTING_ANALYST_PROMPT,
        llm: "gemini-2.0-flash",
        temperature: 0.45,
        max_tokens: -1,
        tools: personalBettingAnalystToolDefinitions.map((tool) => ({
          type: "client",
          name: tool.name,
          description: tool.description,
          expects_response: tool.expects_response,
          parameters: tool.parameters,
        })),
      },
      dynamic_variables: {
        dynamic_variable_placeholders: personalBriefingPlaceholderDefaults(),
      },
    },
  };
}
