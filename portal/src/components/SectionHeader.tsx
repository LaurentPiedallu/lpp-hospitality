// Governing-thought headlines (Overview refinement Fix 5) — section
// headers are today short category labels ("Financial Snapshot", "Guest
// Experience"), but the design intent is for these to eventually become a
// full sentence stating the takeaway rather than the topic (e.g. "Margin
// under pressure on two fronts: labor and kitchen allocation"). That copy
// doesn't exist yet — it requires new upstream generation, and isn't
// something to invent here — so current static labels stay as the
// placeholder/fallback. This component just needs to already be ready to
// wrap a full sentence attractively rather than assuming a two-word label:
// maxWidth keeps a long line from stretching edge-to-edge at this
// container's full width, lineHeight keeps multi-line wraps readable.
export default function SectionHeader({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {eyebrow && (
        <p
          style={{
            fontFamily: "'Jost', 'Inter', system-ui, sans-serif",
            fontSize: 9,
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: "#B8935A",
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </p>
      )}
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "1.6rem",
          fontWeight: 400,
          color: "#12120F",
          lineHeight: 1.35,
          maxWidth: 780,
        }}
      >
        {title}
      </h2>
    </div>
  );
}
