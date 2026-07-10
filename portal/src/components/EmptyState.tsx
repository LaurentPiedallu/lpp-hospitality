import Link from "next/link";

export default function EmptyState({
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: "80px 40px" }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(18,18,15,0.15)" strokeWidth="1.5" style={{ margin: "0 auto" }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
      </svg>
      <p
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "1.4rem",
          fontWeight: 300,
          color: "rgba(18,18,15,0.5)",
          margin: "16px 0 8px",
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontFamily: "'Jost', 'Inter', system-ui, sans-serif",
          fontSize: 13,
          color: "rgba(18,18,15,0.4)",
          lineHeight: 1.7,
          maxWidth: 360,
          margin: "0 auto",
        }}
      >
        {body}
      </p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="hover:text-[#D4AF7A]"
          style={{
            fontFamily: "'Jost', 'Inter', system-ui, sans-serif",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#B8935A",
            textDecoration: "none",
            marginTop: 16,
            display: "inline-block",
            transition: "color 0.25s ease",
          }}
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
