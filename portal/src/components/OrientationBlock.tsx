// Brief 1-2 sentence orientation for a reader landing on this tab directly
// (e.g. via a dashboard/Overview deep link) rather than reading the portal
// top-to-bottom — Portal-Wide refinement, applied to Financial Review and
// Commercial Review. Copy is static, structural "what this tab covers"
// text (not per-property analysis, which would need real upstream
// generation) — same category as RevPASH's own static descriptive line
// elsewhere in the portal, safe to author directly rather than flag as a
// content gap.
export default function OrientationBlock({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "'Jost', 'Inter', system-ui, sans-serif",
        fontSize: 13,
        color: "rgba(18,18,15,0.5)",
        lineHeight: 1.6,
        maxWidth: 720,
        marginBottom: 8,
      }}
    >
      {children}
    </p>
  );
}
