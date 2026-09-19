import type { Property } from "@/types/portal";
import { relativeTime } from "@/lib/format";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

// Same contrast-fixed muted tone PropertyHeader already uses.
const MUTED_TEXT = "rgba(242,237,228,0.55)";

// Slimmed, photo-free variant of PropertyHeader — rolled out (Phase 4B) to
// every interior tab except Overview, all three properties. Prototyped
// first on Financial Review/Lex Yard alone; that conditional is gone now
// that this is the standard header for every non-Overview tab.
//
// Every interior tab after Overview repeats the same full-height property
// photo hero — earned on Overview as a first impression, but the same image
// again on every tab-hop after that, costing vertical space with no new
// information. This drops the photo and most of the vertical padding,
// keeping the property name, status line, and "Last updated" (same
// position/style PropertyHeader uses — top-right, above the name — just
// tightened to match this header's shorter height).
//
// Background stays the same dark #12120F PropertyHeader itself already
// falls back to for photo-less properties (not a new color choice) —
// NavBar's transparentAtTop mode assumes a dark surface directly behind it
// (light logo/text), so keeping that same dark fallback here, just shorter,
// is what keeps the nav legible without reintroducing a photo.
export default function PropertyHeaderSlim({
  property,
  lastUpdated,
}: {
  property: Property;
  lastUpdated?: string | null;
}) {
  return (
    <div style={{ background: "#12120F", padding: "84px 60px 24px" }}>
      {lastUpdated && (
        <div className="flex items-center justify-end" style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: JOST, fontSize: 11, color: MUTED_TEXT }}>
            Last updated {relativeTime(lastUpdated)}
          </p>
        </div>
      )}

      <h1 style={{ fontFamily: SERIF, fontSize: "clamp(1.8rem, 2.6vw, 2.4rem)", fontWeight: 300, color: "rgba(242,237,228,0.92)", lineHeight: 1.1 }}>
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
