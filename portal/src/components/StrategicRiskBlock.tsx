import Link from "next/link";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

// Shared "take this seriously" treatment (Overview refinement Fix 3) —
// dark/high-contrast, the same visual register the #1 Top Priority card
// used to own exclusively before Fix 2 moved it onto the standard white
// card system. Reused across every property page (this is the one
// Overview component all properties render through), and built as its own
// file so it stays the single definition if a future section ever needs
// the same "more serious than a routine KPI card" treatment.
//
// Deliberately NOT wrapped in CollapsibleOnMobile like its neighboring
// Layer 2 sections — CollapsibleOnMobile's toggle arrow is a fixed
// dark-on-light color, which would be unreadable against this block's dark
// background, and collapsing-by-default on mobile runs against the whole
// point of a "don't let this get skipped past" section.
export default function StrategicRiskBlock({
  title = "Strategic Risks",
  finding,
  currentRead,
  crossLink,
}: {
  // Governing-thought-capable (Fix 5) — accepts any length string; "Strategic
  // Risks" is today's static placeholder label, not a hardcoded assumption.
  title?: string;
  finding: string;
  currentRead?: string | null;
  crossLink?: { href: string; label: string } | null;
}) {
  return (
    <div style={{ background: "#12120F", padding: "44px 48px" }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 16 }}>
        {title}
      </p>
      <p style={{ fontFamily: SERIF, fontSize: "clamp(1.2rem, 1.8vw, 1.4rem)", fontWeight: 300, color: "rgba(242,237,228,0.9)", lineHeight: 1.5, maxWidth: 720 }}>
        {finding}
      </p>
      {currentRead && (
        <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(242,237,228,0.5)", lineHeight: 1.7, marginTop: 14, maxWidth: 720 }}>
          {currentRead}
        </p>
      )}
      {crossLink && (
        <div className="text-right" style={{ marginTop: 22 }}>
          <Link
            href={crossLink.href}
            className="hover:text-[#D4AF7A]"
            style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, textDecoration: "none", transition: "color 0.25s ease" }}
          >
            View in {crossLink.label} →
          </Link>
        </div>
      )}
    </div>
  );
}
