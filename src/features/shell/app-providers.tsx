"use client";

import type { ReactNode } from "react";
import { DeskModeProvider } from "@/features/desk/use-desk-mode";

export function AppProviders({ children }: { children: ReactNode }) {
  return <DeskModeProvider>{children}</DeskModeProvider>;
}
