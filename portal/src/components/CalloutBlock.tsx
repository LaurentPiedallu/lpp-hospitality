export default function CalloutBlock({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(18,18,15,0.08)",
        borderLeft: "3px solid #B8935A",
        borderRadius: 0,
        padding: "28px 32px",
        marginBottom: 20,
        fontFamily: "'Jost', 'Inter', system-ui, sans-serif",
        fontSize: 13,
        lineHeight: 1.8,
        color: "rgba(18,18,15,0.65)",
        fontWeight: 300,
      }}
    >
      {children}
    </div>
  );
}
