"use client";

import { useEffect, useState } from "react";
import type { CourtState, RiskAssessment } from "@/domain/types";

export interface LiveDetectionSnapshot {
  courtState: CourtState | null;
  risk: RiskAssessment | null;
  updatedAt: string;
}

const STORAGE_KEY = "clutch.liveDetection";
const CHANGE_EVENT = "clutch-live-detection";

export function readLiveDetection(): LiveDetectionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LiveDetectionSnapshot;
  } catch {
    return null;
  }
}

export function writeLiveDetection(input: {
  courtState: CourtState | null;
  risk: RiskAssessment | null;
}) {
  if (typeof window === "undefined") return;
  const snapshot: LiveDetectionSnapshot = {
    courtState: input.courtState,
    risk: input.risk,
    updatedAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useLiveDetectionSnapshot() {
  const [snapshot, setSnapshot] = useState<LiveDetectionSnapshot | null>(null);

  useEffect(() => {
    const sync = () => setSnapshot(readLiveDetection());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    const interval = window.setInterval(sync, 2_000);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.clearInterval(interval);
    };
  }, []);

  return snapshot;
}
