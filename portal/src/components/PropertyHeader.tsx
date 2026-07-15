import type { Property } from "@/types/portal";
import { relativeTime } from "@/lib/format";
import { propertyPhoto } from "@/lib/property-photos";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

// Vertical scrim, not a flat overlay — sampled the real photo's brightness
// (p95, robust to single-pixel outliers like a light fixture) in the actual
// regions text sits over: nav band + name block need ~80% opacity to keep
// text passing WCAG AA; the lower portion of the hero has no text over it
// and can run much lighter (40%) so the room — the point of using the photo
// — actually reads. 68% is roughly where the property name block ends.
const SCRIM_TOP = "rgba(18,18,15,0.80)";
const SCRIM_BOTTOM = "rgba(18,18,15,0.40)";
const SCRIM_GRADIENT = `linear-gradient(to bottom, ${SCRIM_TOP} 0%, ${SCRIM_TOP} 68%, ${SCRIM_BOTTOM} 100%)`;

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
        // +68px accounts for the fixed nav bar now overlaying this hero
        // (see NavBar's transparentAtTop + PageWrapper's noTopPadding) —
        // the rest of the page is unaffected since this fully offsets the
        // top padding removed from PageWrapper.
        padding: "116px 60px 40px",
        ...(photoUrl
          ? {
              backgroundImage: `${SCRIM_GRADIENT}, url(${photoUrl})`,
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
