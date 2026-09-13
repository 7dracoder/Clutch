"use client";

import { useMemo } from "react";
import type { FixtureExposurePoint } from "@/lib/fixture-exposure";

export function ExposureSparkline({
  points,
  tone = "gold",
  height = 36,
  width = 120,
  ariaLabel,
}: {
  points: FixtureExposurePoint[];
  tone?: "gold" | "orange" | "safe";
  height?: number;
  width?: number;
  ariaLabel?: string;
}) {
  const path = useMemo(() => buildSparkPath(points, width, height), [
    points,
    width,
    height,
  ]);

  if (!points.length) return null;

  const stroke =
    tone === "orange"
      ? "var(--orange)"
      : tone === "safe"
        ? "var(--safe)"
        : "var(--gold)";

  return (
    <svg
      className="exposure-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel ?? "Exposure trend"}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`spark-fill-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {path.area ? (
        <path d={path.area} fill={`url(#spark-fill-${tone})`} />
      ) : null}
      <path
        d={path.line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {path.last ? (
        <circle
          cx={path.last.x}
          cy={path.last.y}
          r="2.4"
          fill={stroke}
          className="pulse-dot"
        />
      ) : null}
    </svg>
  );
}

function buildSparkPath(
  points: FixtureExposurePoint[],
  width: number,
  height: number,
) {
  if (!points.length) return { line: "", area: "", last: null };

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const padY = 4;
  const innerHeight = height - padY * 2;

  const coords = values.map((value, index) => {
    const x =
      points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = padY + innerHeight - ((value - min) / range) * innerHeight;
    return { x, y };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const last = coords.at(-1) ?? null;

  return { line, area, last };
}
