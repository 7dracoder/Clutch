import Link from "next/link";

const PRODUCT_LINE = "Multi-sport AI treasury-risk platform";

export function BrandLockup({
  section,
  meta,
  href,
}: {
  section: string;
  meta?: string;
  href?: string;
}) {
  const body = (
    <div className="brand-copy">
      <div className="brand-line">
        <span className="brand-name">CLUTCH</span>
        <span className="brand-section">{section}</span>
      </div>
      <p className="brand-tagline">{PRODUCT_LINE}</p>
      {meta ? <p className="brand-meta">{meta}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="brand-lockup brand-lockup--link">
        {body}
      </Link>
    );
  }

  return <div className="brand-lockup">{body}</div>;
}
