"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { SlateEvent } from "@/domain/slate";
import { slateGameHref } from "@/features/slate/slate-href";
import { CuteIcon, sportCuteIcon } from "@/features/ui/cute-icon";
import {
  formatExposureCompact,
  type FixtureExposureSeries,
} from "@/lib/fixture-exposure";

const CHART_WIDTH = 960;
const CHART_HEIGHT = 132;
const PAD = { top: 12, right: 12, bottom: 22, left: 52 };

const LINE_COLORS = [
  "var(--gold)",
  "var(--orange)",
  "var(--safe)",
  "color-mix(in srgb, var(--gold) 70%, var(--cream))",
  "color-mix(in srgb, var(--orange) 65%, var(--gold))",
  "color-mix(in srgb, var(--safe) 75%, var(--gold))",
  "color-mix(in srgb, var(--cream) 35%, var(--gold))",
  "color-mix(in srgb, var(--orange) 45%, var(--safe))",
];

export function ExposureBookChart({
  items,
}: {
  items: Array<{ event: SlateEvent; series: FixtureExposureSeries }>;
}) {
  const chart = useMemo(() => buildBookChart(items), [items]);

  if (!items.length) return null;

  return (
    <div className="dash-exposure-chart">
      <div className="dash-exposure-chart-stage">
        <svg
          className="dash-exposure-chart-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={`Open bet exposure across ${items.length} fixtures`}
          preserveAspectRatio="none"
        >
          <defs>
            {chart.lines.map((line, index) => (
              <linearGradient
                key={line.id}
                id={`book-fill-${index}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={line.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={line.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {chart.yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={PAD.left}
                y1={tick.y}
                x2={CHART_WIDTH - PAD.right}
                y2={tick.y}
                className="dash-exposure-chart-grid"
              />
              <text
                x={PAD.left - 8}
                y={tick.y + 3}
                className="dash-exposure-chart-axis"
                textAnchor="end"
              >
                {formatExposureCompact(tick.value)}
              </text>
            </g>
          ))}

          {chart.xTicks.map((tick) => (
            <text
              key={tick.label}
              x={tick.x}
              y={CHART_HEIGHT - 6}
              className="dash-exposure-chart-axis dash-exposure-chart-axis--x"
              textAnchor={tick.anchor}
            >
              {tick.label}
            </text>
          ))}

          {chart.lines.map((line, index) =>
            line.area ? (
              <path
                key={`${line.id}-area`}
                d={line.area}
                fill={`url(#book-fill-${index})`}
              />
            ) : null,
          )}

          {chart.lines.map((line) => (
            <path
              key={line.id}
              d={line.path}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={line.live ? 1 : 0.82}
            />
          ))}

          {chart.lines.map((line) =>
            line.last ? (
              <circle
                key={`${line.id}-dot`}
                cx={line.last.x}
                cy={line.last.y}
                r={line.live ? 3.2 : 2.6}
                fill={line.color}
                className={line.live ? "pulse-dot" : undefined}
              />
            ) : null,
          )}
        </svg>
      </div>

      <div className="dash-exposure-legend" aria-label="Fixtures on chart">
        {chart.lines.map((line) => (
          <Link
            key={line.id}
            href={slateGameHref(line.id)}
            className={`dash-exposure-legend-item${line.live ? " is-live" : ""}`}
          >
            <span
              className="dash-exposure-legend-dot"
              style={{ background: line.color }}
            />
            <span className="dash-exposure-legend-name">{line.label}</span>
            <span className="dash-exposure-legend-meta">
              <CuteIcon name="ticket" size={10} /> {line.openBets}
            </span>
            <span className="dash-exposure-legend-meta">
              <CuteIcon name={sportCuteIcon(line.sport)} size={10} />
            </span>
            <span className="dash-exposure-legend-value">
              {formatExposureCompact(line.currentCents)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function buildBookChart(
  items: Array<{ event: SlateEvent; series: FixtureExposureSeries }>,
) {
  const innerWidth = CHART_WIDTH - PAD.left - PAD.right;
  const innerHeight = CHART_HEIGHT - PAD.top - PAD.bottom;
  const pointCount = items[0]?.series.points.length ?? 0;

  const allValues = items.flatMap((item) =>
    item.series.points.map((point) => point.value),
  );
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const range = Math.max(rawMax - rawMin, 1);
  const min = rawMin - range * 0.06;
  const max = rawMax + range * 0.08;

  const toX = (index: number) =>
    pointCount <= 1
      ? PAD.left + innerWidth / 2
      : PAD.left + (index / (pointCount - 1)) * innerWidth;
  const toY = (value: number) =>
    PAD.top + innerHeight - ((value - min) / (max - min)) * innerHeight;

  const yTicks = [0, 0.5, 1].map((ratio) => {
    const value = Math.round(min + (max - min) * (1 - ratio));
    return { value, y: toY(value) };
  });

  const xTicks = [
    { label: "Open", x: PAD.left, anchor: "start" as const },
    { label: "Now", x: CHART_WIDTH - PAD.right, anchor: "end" as const },
  ];

  const lines = items.map((item, index) => {
    const coords = item.series.points.map((point, pointIndex) => ({
      x: toX(pointIndex),
      y: toY(point.value),
    }));
    const path = coords
      .map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
    const last = coords.at(-1) ?? null;
    const area = last
      ? `${path} L ${last.x} ${CHART_HEIGHT - PAD.bottom} L ${coords[0]?.x ?? PAD.left} ${CHART_HEIGHT - PAD.bottom} Z`
      : "";

    return {
      id: item.event.id,
      label:
        item.event.headline ??
        `${item.event.away.name} vs ${item.event.home.name}`,
      sport: item.event.sport,
      live: item.event.status === "live",
      openBets: item.series.openBets,
      currentCents: item.series.currentCents,
      color:
        item.event.status === "live"
          ? "var(--orange)"
          : LINE_COLORS[index % LINE_COLORS.length],
      path,
      area,
      last,
    };
  });

  return { lines, yTicks, xTicks };
}
