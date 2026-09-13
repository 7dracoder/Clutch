"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import {
  demoOperatorProfile,
  type BettingPlatformIntegration,
  type OperatorProfile,
} from "@/domain/operator-profile";
import { CuteAvatar } from "@/features/profile/cute-avatar";
import { CuteIcon } from "@/features/ui/cute-icon";

function PlatformMark({
  platform,
  size = 40,
}: {
  platform: BettingPlatformIntegration;
  size?: number;
}) {
  return (
    <span
      className="platform-mark"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src={platform.logoSrc}
        alt=""
        width={size}
        height={size}
        className="platform-mark-image"
      />
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="operator-detail-row">
      <span className="operator-detail-label">{label}</span>
      <span className="operator-detail-value">{value}</span>
    </div>
  );
}

export function OperatorProfileControl({
  profile = demoOperatorProfile,
}: {
  profile?: OperatorProfile;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const enabledCount = profile.platforms.filter(
    (platform) => platform.status === "enabled",
  ).length;

  return (
    <div className="operator-profile">
      <button
        ref={triggerRef}
        type="button"
        className={`operator-profile-trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Open profile for ${profile.name}`}
        onClick={() => setOpen((current) => !current)}
      >
        <CuteAvatar size={40} className="operator-profile-avatar" alt="" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="operator-profile-panel"
          role="dialog"
          aria-label="Operator profile"
        >
          <div className="operator-profile-hero">
            <CuteAvatar
              size={72}
              className="operator-profile-hero-avatar"
              alt={profile.name}
            />
            <div className="operator-profile-hero-copy">
              <p className="eyebrow panel-eyebrow gold-text">
                <CuteIcon name="sparkle" size={12} /> Operator profile
              </p>
              <h2>{profile.name}</h2>
              <p>{profile.role}</p>
            </div>
            <button
              type="button"
              className="operator-profile-close"
              aria-label="Close profile"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="operator-profile-body">
            <section className="operator-profile-section">
              <p className="eyebrow panel-eyebrow">
                <CuteIcon name="shield" size={12} /> Desk details
              </p>
              <div className="operator-detail-grid">
                <DetailRow label="Operator ID" value={profile.operatorId} />
                <DetailRow label="Email" value={profile.email} />
                <DetailRow label="Desk" value={profile.desk} />
                <DetailRow label="Clearance" value={profile.clearance} />
                <DetailRow label="Timezone" value={profile.timezone} />
                <DetailRow
                  label="Joined"
                  value={new Date(profile.joinedAt).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                />
              </div>
              <div className="operator-sport-chips">
                {profile.preferredSports.map((sport) => (
                  <span key={sport} className="operator-sport-chip">
                    {sport}
                  </span>
                ))}
              </div>
            </section>

            <section className="operator-profile-section">
              <div className="operator-platform-header">
                <p className="eyebrow panel-eyebrow">
                  <CuteIcon name="ticket" size={12} /> Betting platforms
                </p>
                <span className="operator-platform-count">
                  {enabledCount}/{profile.platforms.length} enabled
                </span>
              </div>
              <ul className="operator-platform-grid">
                {profile.platforms.map((platform) => (
                  <li key={platform.id} className="operator-platform-card">
                    <PlatformMark platform={platform} size={28} />
                    <div className="operator-platform-copy">
                      <strong>{platform.name}</strong>
                      <span>{platform.region}</span>
                    </div>
                    <span
                      className={`operator-platform-status is-${platform.status}`}
                      title={platform.status}
                      aria-label={platform.status}
                    >
                      <CuteIcon name="check" size={10} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
