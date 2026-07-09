export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: 52, minHeight: "100vh", background: "#F2EDE4" }}>
      {children}
    </div>
  );
}
