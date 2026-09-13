"use client";

import { useDeskMode } from "@/features/desk/use-desk-mode";

export function DeskModeToggle() {
  const { mode, setMode, ready } = useDeskMode();

  return (
    <div
      className="desk-mode-toggle"
      role="group"
      aria-label="Desk mode"
      data-ready={ready ? "true" : "false"}
    >
      <button
        type="button"
        className={`desk-mode-option${mode === "treasury" ? " is-active" : ""}`}
        aria-pressed={mode === "treasury"}
        onClick={() => setMode("treasury")}
      >
        Treasury
      </button>
      <button
        type="button"
        className={`desk-mode-option${mode === "personal" ? " is-active" : ""}`}
        aria-pressed={mode === "personal"}
        onClick={() => setMode("personal")}
      >
        Personal
      </button>
    </div>
  );
}
