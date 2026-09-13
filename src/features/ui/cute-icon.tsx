import type { ReactNode } from "react";
import type { SlateSport } from "@/domain/slate";

export type CuteIconName =
  | "sparkle"
  | "search"
  | "live"
  | "standby"
  | "calendar"
  | "chart"
  | "wallet"
  | "shield"
  | "mic"
  | "speaker"
  | "stream"
  | "check"
  | "ticket"
  | "arrow"
  | "soccer"
  | "basketball"
  | "football"
  | "tennis"
  | "mma"
  | "motorsport"
  | "baseball"
  | "hockey"
  | "all-sports"
  | "pulse"
  | "brain";

const paths: Record<CuteIconName, ReactNode> = {
  sparkle: (
    <>
      <path d="M10 2.5l1.2 3.8 3.8 1.2-3.8 1.2L10 12.5 8.8 8.7 5 7.5l3.8-1.2L10 2.5z" />
      <path d="M15.5 4.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9z" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="M12 12l4.5 4.5" />
    </>
  ),
  live: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
    </>
  ),
  standby: <path d="M10 4v6l4 2.5" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="13" height="11" rx="2" />
      <path d="M3.5 8.5h13M7 3.5v3M13 3.5v3" />
    </>
  ),
  chart: (
    <>
      <path d="M3 14V6l4 3 3-4 6 5v4H3z" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="14" height="9" rx="2" />
      <path d="M3 9h14M13 11.5h2.5" />
    </>
  ),
  shield: (
    <path d="M10 3l6 2.5v5c0 4-2.6 6.2-6 7.5-3.4-1.3-6-3.5-6-7.5v-5L10 3z" />
  ),
  mic: (
    <>
      <rect x="7.5" y="4" width="5" height="8" rx="2.5" />
      <path d="M5.5 9.5a4.5 4.5 0 009 0M10 14v2.5" />
    </>
  ),
  speaker: (
    <>
      <path d="M3.5 7.5h3L11 4.5v11L6.5 12.5h-3z" />
      <path d="M13.5 7.5a3.2 3.2 0 010 5" />
      <path d="M15.2 5.8a5.5 5.5 0 010 8.4" />
    </>
  ),
  stream: (
    <>
      <rect x="4" y="6" width="12" height="8" rx="2" />
      <path d="M9 9.5l4 2-4 2v-4z" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="M4.5 10l3 3 8-8" />,
  ticket: (
    <>
      <path d="M5 5h10a2 2 0 012 2v1.5a1.5 1.5 0 000 3V13a2 2 0 01-2 2H5a2 2 0 01-2-2v-1.5a1.5 1.5 0 010-3V7a2 2 0 012-2z" />
      <path d="M10 7v6" strokeDasharray="1.5 2" />
    </>
  ),
  arrow: <path d="M6 10h8M11 6l4 4-4 4" />,
  pulse: <path d="M3 10h2.5l2-5 3 10 2.5-5H17" />,
  brain: (
    <>
      <path d="M10 4.5c2.8 0 4.5 1.8 4.5 4 0 1.6-.8 3-2 3.8.6.8 1 1.8 1 2.9 0 2.4-1.8 3.8-3.5 3.8S6.5 17.6 6.5 15c0-1.1.4-2.1 1-2.9-1.2-.8-2-2.2-2-3.8 0-2.2 1.7-4 4.5-4z" />
    </>
  ),
  soccer: <circle cx="10" cy="10" r="6.5" />,
  basketball: <circle cx="10" cy="10" r="6.5" />,
  football: (
    <path d="M10 3.5c3.6 2 5.5 4.8 5.5 6.5S13.6 14.5 10 16.5 4.5 14.2 4.5 10 6.4 5.5 10 3.5z" />
  ),
  tennis: <circle cx="10" cy="10" r="2.5" />,
  mma: (
    <>
      <circle cx="7" cy="8" r="2.2" />
      <circle cx="13" cy="12" r="2.2" />
      <path d="M8.5 9.5l3 3" />
    </>
  ),
  motorsport: (
    <>
      <path d="M4 11h12l-1.5-3H5.5L4 11z" />
      <circle cx="7" cy="12.5" r="1.5" />
      <circle cx="13" cy="12.5" r="1.5" />
    </>
  ),
  baseball: <circle cx="10" cy="10" r="6.5" />,
  hockey: (
    <>
      <path d="M6 14l6-8" />
      <path d="M12.5 5.5l2 2-2 2" />
    </>
  ),
  "all-sports": (
    <>
      <circle cx="7" cy="8" r="2.5" />
      <circle cx="13" cy="8" r="2.5" />
      <circle cx="10" cy="13" r="2.5" />
    </>
  ),
};

export function CuteIcon({
  name,
  size = 16,
  className = "",
  label,
}: {
  name: CuteIconName;
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      className={`cute-icon cute-icon--${name} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {paths[name]}
    </svg>
  );
}

export function sportCuteIcon(sport: SlateSport | "all"): CuteIconName {
  switch (sport) {
    case "soccer":
      return "soccer";
    case "basketball":
      return "basketball";
    case "american_football":
      return "football";
    case "tennis":
      return "tennis";
    case "mma":
      return "mma";
    case "motorsport":
      return "motorsport";
    case "baseball":
      return "baseball";
    case "hockey":
      return "hockey";
    default:
      return "all-sports";
  }
}
