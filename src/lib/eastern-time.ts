const EASTERN_ZONE = "America/New_York";

export function formatKickoffEt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time TBA ET";
  return date.toLocaleString("en-US", {
    timeZone: EASTERN_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatClockEt(date = new Date()) {
  return date.toLocaleTimeString("en-US", {
    timeZone: EASTERN_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
