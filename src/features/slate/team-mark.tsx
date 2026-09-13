export function teamInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "");
}

export function TeamMark({
  name,
  logoUrl,
  size = "sm",
}: {
  name: string;
  logoUrl?: string;
  size?: "sm" | "lg";
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={size === "lg" ? "slate-mark-lg" : "slate-mark-sm"}
      />
    );
  }
  return (
    <span className={`slate-crest${size === "lg" ? " slate-crest--lg" : ""}`}>
      {teamInitials(name)}
    </span>
  );
}
