import type { SlateSport } from "@/domain/slate";

export interface SportDeskCopy {
  label: string;
  eyebrow: string;
  twinEyebrow: string;
  twinTitle: string;
  actionLabel: string;
  defaultAction: string;
  attemptLabel: string;
  scoreLabel: string;
  note: string;
  triggerVerb: string;
  leadIdle: string;
  leadReady: string;
  leadAtRisk: string;
  suggestedActions: [string, string, string];
  exposureTitle: string;
  waitingFactors: [string, string, string];
  supportsPitchTwin: boolean;
}

const desks: Record<SlateSport, SportDeskCopy> = {
  soccer: {
    label: "Soccer",
    eyebrow: "Live Treasury / Soccer",
    twinEyebrow: "Pitch Twin",
    twinTitle: "Possession Forecast",
    actionLabel: "Likely action",
    defaultAction: "Shot On Goal",
    attemptLabel: "Shot probability",
    scoreLabel: "Goal probability",
    note: "Prediction is directional, not guaranteed. Tracking, defender spacing, possession, and movement determine this scenario.",
    triggerVerb: "shot on goal",
    leadIdle:
      "Text research is loaded. Tap the feed to attach AirServer when you are ready.",
    leadReady:
      "Current safe cash covers the modeled event exposure. Continue monitoring the live possession.",
    leadAtRisk:
      "Preserve liquidity and review pending outflows before this possession resolves.",
    suggestedActions: [
      "Confirm live tracking confidence.",
      "Review pending Rho outflows.",
      "Maintain the configured payout reserve.",
    ],
    exposureTitle: "Live Event Scenario",
    waitingFactors: [
      "Waiting for live possession evidence",
      "Rho liquidity is available",
      "Payout reserve is applied",
    ],
    supportsPitchTwin: true,
  },
  basketball: {
    label: "Basketball",
    eyebrow: "Live Treasury / Basketball",
    twinEyebrow: "Court Twin",
    twinTitle: "Shot Forecast",
    actionLabel: "Likely action",
    defaultAction: "Three Point Attempt",
    attemptLabel: "Attempt probability",
    scoreLabel: "Make probability",
    note: "Prediction is directional, not guaranteed. Spacing, defender distance, and shot clock pressure determine this scenario.",
    triggerVerb: "three point attempt",
    leadIdle:
      "Text research is loaded. Tap the feed to attach AirServer when you are ready.",
    leadReady:
      "Current safe cash covers the modeled shot exposure. Continue monitoring the live possession.",
    leadAtRisk:
      "Preserve liquidity and review pending outflows before this possession resolves.",
    suggestedActions: [
      "Confirm live tracking confidence.",
      "Review pending Rho outflows.",
      "Maintain the configured payout reserve.",
    ],
    exposureTitle: "Live Shot Scenario",
    waitingFactors: [
      "Waiting for live possession evidence",
      "Rho liquidity is available",
      "Payout reserve is applied",
    ],
    supportsPitchTwin: true,
  },
  american_football: {
    label: "American Football",
    eyebrow: "Live Treasury / American Football",
    twinEyebrow: "Field Twin",
    twinTitle: "Drive Forecast",
    actionLabel: "Likely play",
    defaultAction: "Passing Attempt",
    attemptLabel: "Conversion probability",
    scoreLabel: "Scoring probability",
    note: "Prediction is directional, not guaranteed. Down, distance, and formation context determine this scenario.",
    triggerVerb: "passing attempt",
    leadIdle:
      "Text research is loaded. Tap the feed to attach AirServer when you are ready.",
    leadReady:
      "Current safe cash covers the modeled play exposure. Continue monitoring the live drive.",
    leadAtRisk:
      "Preserve liquidity and review pending outflows before this play resolves.",
    suggestedActions: [
      "Confirm live formation and down context.",
      "Review pending Rho outflows.",
      "Maintain the configured payout reserve.",
    ],
    exposureTitle: "Live Play Scenario",
    waitingFactors: [
      "Waiting for live drive evidence",
      "Rho liquidity is available",
      "Payout reserve is applied",
    ],
    supportsPitchTwin: false,
  },
  tennis: {
    label: "Tennis",
    eyebrow: "Live Treasury / Tennis",
    twinEyebrow: "Court Twin",
    twinTitle: "Point Forecast",
    actionLabel: "Likely outcome",
    defaultAction: "Break Point",
    attemptLabel: "Point win probability",
    scoreLabel: "Game win probability",
    note: "Prediction is directional, not guaranteed. Serve, return pressure, and momentum determine this scenario.",
    triggerVerb: "break point",
    leadIdle:
      "Text research is loaded. Tap the feed to attach AirServer when you are ready.",
    leadReady:
      "Current safe cash covers the modeled point exposure. Continue monitoring the live rally.",
    leadAtRisk:
      "Preserve liquidity and review pending outflows before this point resolves.",
    suggestedActions: [
      "Confirm live rally and serve context.",
      "Review pending Rho outflows.",
      "Maintain the configured payout reserve.",
    ],
    exposureTitle: "Live Point Scenario",
    waitingFactors: [
      "Waiting for live point evidence",
      "Rho liquidity is available",
      "Payout reserve is applied",
    ],
    supportsPitchTwin: false,
  },
  mma: {
    label: "MMA",
    eyebrow: "Live Treasury / MMA",
    twinEyebrow: "Cage Twin",
    twinTitle: "Round Forecast",
    actionLabel: "Likely action",
    defaultAction: "Takedown Attempt",
    attemptLabel: "Finish probability",
    scoreLabel: "Round win probability",
    note: "Prediction is directional, not guaranteed. Pace, control, and striking exchanges determine this scenario.",
    triggerVerb: "takedown attempt",
    leadIdle:
      "Text research is loaded. Tap the feed to attach AirServer when you are ready.",
    leadReady:
      "Current safe cash covers the modeled bout exposure. Continue monitoring the live exchange.",
    leadAtRisk:
      "Preserve liquidity and review pending outflows before this exchange resolves.",
    suggestedActions: [
      "Confirm live striking and control context.",
      "Review pending Rho outflows.",
      "Maintain the configured payout reserve.",
    ],
    exposureTitle: "Live Bout Scenario",
    waitingFactors: [
      "Waiting for live bout evidence",
      "Rho liquidity is available",
      "Payout reserve is applied",
    ],
    supportsPitchTwin: false,
  },
  motorsport: {
    label: "Formula 1",
    eyebrow: "Live Treasury / Formula 1",
    twinEyebrow: "Race Twin",
    twinTitle: "Race Forecast",
    actionLabel: "Likely event",
    defaultAction: "Overtake Window",
    attemptLabel: "Overtake probability",
    scoreLabel: "Lead change probability",
    note: "Prediction is directional, not guaranteed. Tire life, gap, and pit windows determine this scenario.",
    triggerVerb: "overtake",
    leadIdle:
      "Text research is loaded. Tap the feed to attach AirServer when you are ready.",
    leadReady:
      "Current safe cash covers the modeled race exposure. Continue monitoring the live stint.",
    leadAtRisk:
      "Preserve liquidity and review pending outflows before this race event resolves.",
    suggestedActions: [
      "Confirm live gap and pit strategy context.",
      "Review pending Rho outflows.",
      "Maintain the configured payout reserve.",
    ],
    exposureTitle: "Live Race Scenario",
    waitingFactors: [
      "Waiting for live race evidence",
      "Rho liquidity is available",
      "Payout reserve is applied",
    ],
    supportsPitchTwin: false,
  },
  baseball: {
    label: "Baseball",
    eyebrow: "Live Treasury / Baseball",
    twinEyebrow: "Diamond Twin",
    twinTitle: "At-Bat Forecast",
    actionLabel: "Likely outcome",
    defaultAction: "Base Hit",
    attemptLabel: "Contact probability",
    scoreLabel: "Hit probability",
    note: "Prediction is directional, not guaranteed. Count, pitch mix, and runner leverage determine this scenario.",
    triggerVerb: "base hit",
    leadIdle:
      "Text research is loaded. Tap the feed to attach AirServer when you are ready.",
    leadReady:
      "Current safe cash covers the modeled at-bat exposure. Continue monitoring the live plate appearance.",
    leadAtRisk:
      "Preserve liquidity and review pending outflows before this at-bat resolves.",
    suggestedActions: [
      "Confirm live count and runner context.",
      "Review pending Rho outflows.",
      "Maintain the configured payout reserve.",
    ],
    exposureTitle: "Live At-Bat Scenario",
    waitingFactors: [
      "Waiting for live plate appearance evidence",
      "Rho liquidity is available",
      "Payout reserve is applied",
    ],
    supportsPitchTwin: false,
  },
  hockey: {
    label: "Hockey",
    eyebrow: "Live Treasury / Hockey",
    twinEyebrow: "Rink Twin",
    twinTitle: "Possession Forecast",
    actionLabel: "Likely action",
    defaultAction: "Shot On Goal",
    attemptLabel: "Shot probability",
    scoreLabel: "Goal probability",
    note: "Prediction is directional, not guaranteed. Zone entry, defender pressure, and puck control determine this scenario.",
    triggerVerb: "shot on goal",
    leadIdle:
      "Text research is loaded. Tap the feed to attach AirServer when you are ready.",
    leadReady:
      "Current safe cash covers the modeled event exposure. Continue monitoring the live shift.",
    leadAtRisk:
      "Preserve liquidity and review pending outflows before this shift resolves.",
    suggestedActions: [
      "Confirm live zone and puck context.",
      "Review pending Rho outflows.",
      "Maintain the configured payout reserve.",
    ],
    exposureTitle: "Live Shift Scenario",
    waitingFactors: [
      "Waiting for live shift evidence",
      "Rho liquidity is available",
      "Payout reserve is applied",
    ],
    supportsPitchTwin: false,
  },
};

export function sportDeskCopy(sport?: string | null): SportDeskCopy {
  if (sport && sport in desks) {
    return desks[sport as SlateSport];
  }
  return desks.soccer;
}
