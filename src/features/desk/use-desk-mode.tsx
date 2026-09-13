"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DESK_MODE_STORAGE_KEY,
  isDeskMode,
  type DeskMode,
} from "@/domain/desk-mode";

type DeskModeContextValue = {
  mode: DeskMode;
  setMode: (mode: DeskMode) => void;
  ready: boolean;
  isPersonal: boolean;
  isTreasury: boolean;
};

const DeskModeContext = createContext<DeskModeContextValue | null>(null);

export function DeskModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DeskMode>("treasury");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DESK_MODE_STORAGE_KEY);
      if (isDeskMode(stored)) setModeState(stored);
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  const setMode = useCallback((next: DeskMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(DESK_MODE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      ready,
      isPersonal: mode === "personal",
      isTreasury: mode === "treasury",
    }),
    [mode, ready, setMode],
  );

  return (
    <DeskModeContext.Provider value={value}>{children}</DeskModeContext.Provider>
  );
}

export function useDeskMode() {
  const context = useContext(DeskModeContext);
  if (!context) {
    throw new Error("useDeskMode must be used within DeskModeProvider");
  }
  return context;
}
