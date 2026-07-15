import type { Property } from "@/types/portal";
import { relativeTime } from "@/lib/format";
import { propertyPhoto } from "@/lib/property-photos";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

// Scrim opacity chosen so a worst-case bright photo highlight still lands
// within ~0.02:1 of the flat #12120F background's own contrast baseline —
// verified against WCAG's relative-luminance formula, not eyeballed.
const SCRIM = "rgba(18,18,15,0.92)";

// The pre-existing 0.3/0.35-opacity muted text in this header measured
// 2.47:1 / 2.92:1 contrast against the flat background alone — already
// under WCAG AA's 4.5:1 for normal text, with no photo involved. Bumped to
// 0.55 (5.48:1 on flat, 5.06:1 against the worst-case photo+scrim
// background) so every property using this header — not just ones with a
// photo — actually passes, not just "looks okay."
const MUTED_TEXT = "rgba(242,237,228,0.55)";

// Same header on every property tab (Overview, Financial Review, Commercial
// Review, Menu Engineering, Initiatives, Intelligence, Upload). No financial
// KPI row (Financial Snapshot on Overview duplicates it with more context)
// and no "Portfolio" link (redundant with the always-visible nav bar logo).
export default function PropertyHeader({
  property,
  lastUpdated,
}: {
  property: Property;
  lastUpdated?: string | null;
}) {
  const photoUrl = propertyPhoto(property.id);

  return (
    <div
      style={{
        padding: "48px 60px 40px",
        ...(photoUrl
          ? {
              backgroundImage: `linear-gradient(${SCRIM}, ${SCRIM}), url(${photoUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { background: "#12120F" }),
      }}
    >
      {lastUpdated && (
        <div className="flex items-center justify-end" style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: JOST, fontSize: 11, color: MUTED_TEXT }}>
            Last updated {relativeTime(lastUpdated)}
          </p>
        </div>
      )}

      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 8 }}>
        {property.location || property.conceptType}
      </p>

      <h1 style={{ fontFamily: SERIF, fontSize: "clamp(2.4rem, 4vw, 3.6rem)", fontWeight: 300, color: "rgba(242,237,228,0.92)", lineHeight: 1.05 }}>
        {property.name}
      </h1>

      <p style={{ fontFamily: JOST, fontSize: 12, color: MUTED_TEXT, marginTop: 6 }}>
        {property.conceptType}
        {property.conceptType && " · "}
        Data confidence: {property.dataConfidence}
      </p>
    </div>
  );
}
