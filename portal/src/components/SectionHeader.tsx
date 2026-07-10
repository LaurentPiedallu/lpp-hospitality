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
        }}
      >
        {title}
      </h2>
    </div>
  );
}
