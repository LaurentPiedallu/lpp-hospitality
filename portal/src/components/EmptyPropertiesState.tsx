export default function EmptyPropertiesState() {
  return (
    <div style={{ textAlign: "center", padding: "48px 0" }}>
      <h3
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400,
          fontSize: "22px",
          color: "#12120F",
          marginBottom: 10,
        }}
      >
        Your properties are being set up.
      </h3>
      <p style={{ fontSize: "13px", color: "rgba(18,18,15,0.5)", maxWidth: 420, margin: "0 auto" }}>
        You&apos;ll receive a confirmation once your first report is ready. Reach out to{" "}
        <a href="mailto:laurent@lpphospitality.com" style={{ color: "inherit", textDecoration: "underline" }}>
          laurent@lpphospitality.com
        </a>{" "}
        with any questions.
      </p>
    </div>
  );
}
