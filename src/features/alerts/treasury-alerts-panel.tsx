"use client";

import type { TreasuryAlert } from "@/domain/treasury-alerts";
import { CuteIcon } from "@/features/ui/cute-icon";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function TreasuryAlertsPanel({
  alerts,
  focusedAlertId,
  onApprove,
  onReject,
  onFocus,
  onRequestReadout,
}: {
  alerts: TreasuryAlert[];
  focusedAlertId?: string | null;
  onApprove: (alertId: string) => void;
  onReject: (alertId: string) => void;
  onFocus: (alertId: string) => void;
  onRequestReadout?: () => void;
}) {
  if (!alerts.length) return null;
  const openCount = alerts.filter((alert) => alert.decision === "open").length;

  return (
    <section
      id="treasury-alerts-panel"
      className="desk-card treasury-alerts-panel"
      aria-label="Treasury approvals"
    >
      <div className="panel-header desk-card-header treasury-alerts-header">
        <div className="desk-card-header-copy">
          <p className="eyebrow panel-eyebrow orange-text">
            <CuteIcon name="pulse" size={12} /> Desk approvals
          </p>
          <h2>Alerts needing a decision</h2>
        </div>
        <div className="treasury-alerts-header-actions">
          <span className="risk-badge risk-badge--watch">{openCount} open</span>
          <button
            type="button"
            className="treasury-alerts-speak"
            onClick={() => onRequestReadout?.()}
            aria-label="Ask voice analyst to read desk approvals"
            title="Ask voice to read approvals"
          >
            <CuteIcon name="speaker" size={14} />
            Ask voice
          </button>
        </div>
      </div>
      <div className="desk-card-body treasury-alerts-list">
        {alerts.map((alert) => (
          <article
            key={alert.id}
            className={`treasury-alert treasury-alert--${alert.severity}${
              focusedAlertId === alert.id ? " is-focused" : ""
            }${alert.decision !== "open" ? ` is-${alert.decision}` : ""}`}
          >
            <button
              type="button"
              className="treasury-alert-main"
              onClick={() => onFocus(alert.id)}
            >
              <p className="treasury-alert-title">{alert.title}</p>
              <p className="treasury-alert-reason">{alert.reason}</p>
              <p className="treasury-alert-ask">{alert.ask}</p>
              {alert.amountCents != null ? (
                <p className="treasury-alert-amount gold-text">
                  {money(alert.amountCents)}
                </p>
              ) : null}
            </button>
            {alert.decision === "open" ? (
              <div className="treasury-alert-actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => onApprove(alert.id)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => onReject(alert.id)}
                >
                  Reject
                </button>
              </div>
            ) : (
              <p className="treasury-alert-decision panel-eyebrow">
                <CuteIcon
                  name={alert.decision === "approved" ? "check" : "shield"}
                  size={12}
                />
                {alert.decision}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
