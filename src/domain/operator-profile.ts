export interface BettingPlatformIntegration {
  id: string;
  name: string;
  shortLabel: string;
  accent: string;
  status: "enabled" | "pending" | "disabled";
  region: string;
  /** Local brand mark under /public/platforms */
  logoSrc: string;
}

export interface OperatorProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  desk: string;
  timezone: string;
  operatorId: string;
  clearance: string;
  joinedAt: string;
  preferredSports: string[];
  platforms: BettingPlatformIntegration[];
}

/** Demo desk operator shown in the Clutch profile drawer. */
export const demoOperatorProfile: OperatorProfile = {
  id: "op-clutch-001",
  name: "Avery Chen",
  role: "Treasury Desk Operator",
  email: "avery.chen@clutch.desk",
  desk: "Command Center · Rho sandbox",
  timezone: "America/New_York (ET)",
  operatorId: "CLH-OPS-2048",
  clearance: "Live payout approvals",
  joinedAt: "2025-11-04",
  preferredSports: ["Soccer", "NBA", "NFL", "Tennis"],
  platforms: [
    {
      id: "draftkings",
      name: "DraftKings",
      shortLabel: "DK",
      accent: "#53D337",
      status: "enabled",
      region: "US",
      logoSrc: "/platforms/draftkings.png",
    },
    {
      id: "fanduel",
      name: "FanDuel",
      shortLabel: "FD",
      accent: "#1493FF",
      status: "enabled",
      region: "US",
      logoSrc: "/platforms/fanduel.png",
    },
    {
      id: "betmgm",
      name: "BetMGM",
      shortLabel: "MGM",
      accent: "#C4A962",
      status: "enabled",
      region: "US",
      logoSrc: "/platforms/betmgm.png",
    },
    {
      id: "caesars",
      name: "Caesars",
      shortLabel: "CZR",
      accent: "#C8102E",
      status: "enabled",
      region: "US",
      logoSrc: "/platforms/caesars.png",
    },
    {
      id: "espnbet",
      name: "ESPN BET",
      shortLabel: "ESPN",
      accent: "#D00",
      status: "enabled",
      region: "US",
      logoSrc: "/platforms/espnbet.png",
    },
    {
      id: "fanatics",
      name: "Fanatics",
      shortLabel: "FAN",
      accent: "#000",
      status: "enabled",
      region: "US",
      logoSrc: "/platforms/fanatics.png",
    },
    {
      id: "bet365",
      name: "bet365",
      shortLabel: "365",
      accent: "#027B5B",
      status: "enabled",
      region: "Global",
      logoSrc: "/platforms/bet365.png",
    },
    {
      id: "pointsbet",
      name: "PointsBet",
      shortLabel: "PB",
      accent: "#E31837",
      status: "enabled",
      region: "US",
      logoSrc: "/platforms/pointsbet.png",
    },
    {
      id: "hardrock",
      name: "Hard Rock Bet",
      shortLabel: "HR",
      accent: "#F5A623",
      status: "enabled",
      region: "US",
      logoSrc: "/platforms/hardrock.png",
    },
    {
      id: "williamhill",
      name: "William Hill",
      shortLabel: "WH",
      accent: "#003B70",
      status: "enabled",
      region: "UK",
      logoSrc: "/platforms/williamhill.png",
    },
    {
      id: "betfair",
      name: "Betfair",
      shortLabel: "BF",
      accent: "#FFB80C",
      status: "enabled",
      region: "Exchange",
      logoSrc: "/platforms/betfair.png",
    },
    {
      id: "circa",
      name: "Circa Sports",
      shortLabel: "CIR",
      accent: "#1B4F72",
      status: "enabled",
      region: "NV",
      logoSrc: "/platforms/circa.png",
    },
  ],
};
