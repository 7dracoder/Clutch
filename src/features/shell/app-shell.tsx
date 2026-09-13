"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DeskModeToggle } from "@/features/desk/desk-mode-toggle";
import { OperatorProfileControl } from "@/features/profile/operator-profile-panel";
import { WebGLLiquidBackground } from "@/features/ui/webgl-liquid";

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <WebGLLiquidBackground />
      <div className="dash-shell">
        <header className="dash-topbar">
          <div className="dash-topbar-brand">
            <Link href="/slate" className="dash-brand">
              <span className="dash-brand-name">CLUTCH</span>
            </Link>
            {title ? (
              <div className="dash-topbar-copy">
                <h1 className="dash-title">{title}</h1>
                {subtitle ? <p className="dash-subtitle">{subtitle}</p> : null}
              </div>
            ) : null}
          </div>
          <div className="dash-topbar-actions">
            <DeskModeToggle />
            {actions}
            <OperatorProfileControl />
          </div>
        </header>
        <div className="dash-content">{children}</div>
      </div>
    </>
  );
}
