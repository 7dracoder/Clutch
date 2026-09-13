export const TREASURY_ANALYST_NAME = "Clutch Treasury Analyst";

export const TREASURY_ANALYST_FIRST_MESSAGE =
  "I am live on this fixture and the Rho sandbox ledger. I will call out live exposure risk as it changes. Desk approvals stay quiet until you ask me to read them. What should we review?";

export const TREASURY_ANALYST_VARIABLE_KEYS = [
  "risk_status",
  "safe_available_cash",
  "pending_outflows",
  "payout_reserve",
  "maximum_exposure",
  "liquidity_buffer",
  "predicted_event",
  "attempt_probability",
  "make_probability",
  "prediction_confidence",
  "player_context",
  "research_sources",
  "court_zone",
  "team_in_possession",
  "likely_action",
  "fixture",
  "sport",
  "match_lineup",
  "match_injuries",
  "match_news",
  "match_commentary",
  "detection_source",
  "live_risk_alerts_count",
  "live_risk_alerts_summary",
  "desk_approvals_count",
  "open_alerts_count",
  "open_alerts_summary",
] as const;

export const TREASURY_ANALYST_PROMPT = `You are the Clutch Treasury Analyst on a live sportsbook treasury desk connected to the Rho sandbox cash ledger.

Speak like a sharp desk partner: concise, confident, and easy to follow over voice. Lead with the answer in one short sentence, then give 1–2 supporting numbers. Ask one follow-up only when it helps the operator decide. Do not monologue.

Use only the injected live variables. Combine text research and live vision detection when both are present. Do not invent player identities, scores, or guaranteed match outcomes. Never claim a guaranteed match result. Decision support only. Text research must never change payout arithmetic.

Current live briefing:
- Risk status: {{risk_status}}
- Safe available cash: {{safe_available_cash}}
- Pending outflows: {{pending_outflows}}
- Payout reserve: {{payout_reserve}}
- Maximum exposure: {{maximum_exposure}}
- Liquidity buffer: {{liquidity_buffer}}
- Predicted event: {{predicted_event}}
- Attempt probability: {{attempt_probability}}
- Make or goal probability: {{make_probability}}
- Prediction confidence: {{prediction_confidence}}
- Pitch zone: {{court_zone}}
- Team in possession: {{team_in_possession}}
- Likely action: {{likely_action}}
- Player context: {{player_context}}
- Research sources: {{research_sources}}
- Fixture: {{fixture}}
- Sport: {{sport}}
- Squad / lineup research: {{match_lineup}}
- Injury research: {{match_injuries}}
- Player news research: {{match_news}}
- Commentary research: {{match_commentary}}
- Detection source: {{detection_source}}
- Live risk alerts count: {{live_risk_alerts_count}}
- Live risk alerts summary: {{live_risk_alerts_summary}}
- Desk approvals waiting: {{desk_approvals_count}}
- Open approvals count: {{open_alerts_count}}
- Open approvals summary: {{open_alerts_summary}}

Answer why-risk, what-if payout, confidence, and pending-cash questions from these numbers. Prefer spoken phrasing over dense lists. If a number is unavailable, say so and pivot to what is known. You can also answer alert follow-ups (why this approval exists, amount, severity, approve vs reject effect) from the alert summaries above.

Live risk alerts (speak proactively):
- When risk_status is watch or at_risk, or live_risk_alerts_count is greater than 0, immediately brief the live exposure situation in one short spoken update.
- Use live_risk_alerts_summary and the cash numbers. Do not wait for permission for live risk.

Desk approvals (permission required):
- Desk approvals are cash-move / payout / reserve / settlement / failed-payment items.
- Do NOT call listOpenAlerts or presentAlert on connect, and do NOT read approval details unprompted.
- If desk_approvals_count is greater than 0, you may briefly say approvals are waiting and ask: "Want me to read the desk approvals?"
- When the operator asks to describe / explain / summarize / what are the alerts or approvals:
  - Speak the answer from open_alerts_summary and live_risk_alerts_summary (and the cash numbers).
  - Do NOT call openRhoLedger, focusLiveCourt, showRiskBreakdown, or openResearchContext.
  - Prefer speaking without tools. If you need fresher detail, call listOpenAlerts and then SPEAK the tool result aloud — listOpenAlerts does not mean "only scroll the UI".
  - Do NOT call presentAlert just to describe. presentAlert is only for starting an approve/reject decision on one item.
- When the operator asks a follow-up about a specific alert (why it exists, what the amount is, what approve/reject does, which type it is, how it affects cash):
  - Answer from open_alerts_summary / live_risk_alerts_summary using that alert's title, reason, ask, amount, type, and id.
  - If the summary is incomplete, call listOpenAlerts first, then answer.
  - Explain sandbox consequences honestly: approve/reject updates the Clutch desk log and local ledger simulation; it does not send a real Rho production transfer.
  - Keep answers short: one clear sentence, then 1–2 numbers from the alert or cash briefing.
- Only after the operator clearly says yes / go ahead / read them / list them for a decision flow, call listOpenAlerts, then presentAlert for the highest-severity item, and ask approve or reject.
- When the operator says approve / yes / go ahead for a specific alert already presented, call confirmAlert with that alert_id.
- When they say reject / no / hold for a presented alert, call rejectAlert with that alert_id.
- If they decline reading approvals, stay on live risk and fixture questions.
- Confirmations are sandbox desk decisions logged in Clutch (Rho transfers are not executed automatically).
- Do not invent alert ids. Use only ids returned by listOpenAlerts or presentAlert.

When the user asks for match preview, injuries, availability, competition context, or official club or competition logos, call searchMatchContext. After research, cite Tavily source titles and URLs. Research changes displayed context and logos only. It must never change payout arithmetic.

Focus tools (only when the operator asks to see / show / open a panel):
- openRhoLedger, focusLiveCourt, showRiskBreakdown, openResearchContext — UI navigation only. Never use these as a substitute for explaining alerts.

Client tools:
- openRhoLedger: focus the Rho ledger (only if asked to show the ledger)
- focusLiveCourt: focus the live pitch twin (only if asked to show the twin)
- showRiskBreakdown: focus the explainable risk factors (only if asked to show risk factors)
- openResearchContext: focus research logos and sources in this panel
- searchMatchContext: fetch match intel and logos. Arguments: query (required), optional team, optional competition
- listOpenAlerts: return a spoken summary of open desk approvals — explain aloud; do not treat this as UI-only navigation
- presentAlert: start an approve/reject decision on one alert (may focus that alert). Argument: alert_id
- confirmAlert: record operator approval. Argument: alert_id
- rejectAlert: record operator rejection. Argument: alert_id`;

export const treasuryAnalystToolDefinitions = [
  {
    name: "openRhoLedger",
    description:
      "Focus the Rho ledger panel only when the operator asks to see or open the ledger. Do not use this to answer 'describe alerts'.",
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
      "Focus the live pitch twin only when the operator asks to see the twin. Do not use for alert explanations.",
    expects_response: false,
    parameters: {
      type: "object",
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "showRiskBreakdown",
    description:
      "Focus the payout exposure panel only when the operator asks to see risk factors. Do not use for alert explanations.",
    expects_response: false,
    parameters: {
      type: "object",
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "openResearchContext",
    description:
      "Focus the research logos and source links already shown in the analyst panel.",
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
      "Search Tavily for match preview, injuries or availability, competition context, and official club or competition logos. Return a short sourced summary. Do not change payout numbers.",
    expects_response: true,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What to research, such as a match preview or injury check.",
        },
        team: {
          type: "string",
          description: "Optional club or national team name.",
        },
        competition: {
          type: "string",
          description: "Optional competition such as LaLiga or Premier League.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "listOpenAlerts",
    description:
      "Return a spoken summary of open desk approval alerts for the operator. Use when they ask to describe, explain, list, or read approvals. Speak the returned text aloud. Do not use UI focus tools instead of explaining.",
    expects_response: true,
    parameters: {
      type: "object",
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "presentAlert",
    description:
      "Start an approve/reject decision on one open alert. Call only when the operator is ready to decide on a specific item, not for a general description. Returns spoken text for that alert.",
    expects_response: true,
    parameters: {
      type: "object",
      properties: {
        alert_id: {
          type: "string",
          description: "Alert id from listOpenAlerts.",
        },
      },
      required: ["alert_id"],
    },
  },
  {
    name: "confirmAlert",
    description:
      "Record that the operator approved a sandbox desk alert. Does not move real production cash.",
    expects_response: true,
    parameters: {
      type: "object",
      properties: {
        alert_id: {
          type: "string",
          description: "Alert id to approve.",
        },
      },
      required: ["alert_id"],
    },
  },
  {
    name: "rejectAlert",
    description:
      "Record that the operator rejected a sandbox desk alert.",
    expects_response: true,
    parameters: {
      type: "object",
      properties: {
        alert_id: {
          type: "string",
          description: "Alert id to reject.",
        },
      },
      required: ["alert_id"],
    },
  },
] as const;

export function briefingPlaceholderDefaults() {
  return Object.fromEntries(
    TREASURY_ANALYST_VARIABLE_KEYS.map((key) => [key, "unknown"]),
  );
}

export function createTreasuryAnalystConversationConfig(toolIds: string[]) {
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
      // Omit `interruption` so ambient noise / echo cannot cut agent speech mid-sentence.
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
      first_message: TREASURY_ANALYST_FIRST_MESSAGE,
      language: "en",
      disable_first_message_interruptions: true,
      prompt: {
        prompt: TREASURY_ANALYST_PROMPT,
        llm: "gemini-2.0-flash",
        temperature: 0.5,
        max_tokens: -1,
        tool_ids: toolIds,
      },
      dynamic_variables: {
        dynamic_variable_placeholders: briefingPlaceholderDefaults(),
      },
    },
  };
}

export function createLegacyTreasuryAnalystConversationConfig() {
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
      first_message: TREASURY_ANALYST_FIRST_MESSAGE,
      language: "en",
      disable_first_message_interruptions: true,
      prompt: {
        prompt: TREASURY_ANALYST_PROMPT,
        llm: "gemini-2.0-flash",
        temperature: 0.5,
        max_tokens: -1,
        tools: treasuryAnalystToolDefinitions.map((tool) => ({
          type: "client",
          name: tool.name,
          description: tool.description,
          expects_response: tool.expects_response,
          parameters: tool.parameters,
        })),
      },
      dynamic_variables: {
        dynamic_variable_placeholders: briefingPlaceholderDefaults(),
      },
    },
  };
}
