export function shouldMuteLiveStream(input: {
  conversationStatus: string;
  agentSpeaking: boolean;
  awaitingOperatorReply?: boolean;
}) {
  if (input.conversationStatus === "connecting") return true;
  if (input.agentSpeaking) return true;
  if (
    input.awaitingOperatorReply &&
    input.conversationStatus === "connected"
  ) {
    return true;
  }
  return false;
}

/**
 * Keep the live feed ducked briefly after the analyst finishes so the mic can
 * pick up the operator clearly. Does not end the session.
 */
export const ANALYST_STREAM_DUCK_MS = 12_000;

/**
 * End an idle connected voice session only after a long silence — short
 * timeouts were cutting operators off mid-reply.
 */
export const ANALYST_IDLE_END_MS = 90_000;

/** @deprecated Use ANALYST_IDLE_END_MS — kept for older imports/tests. */
export const ANALYST_ALERT_REPLY_TIMEOUT_MS = ANALYST_IDLE_END_MS;
