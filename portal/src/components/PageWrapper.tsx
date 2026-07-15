export default function PageWrapper({
  children,
  noTopPadding,
}: {
  children: React.ReactNode;
  // Only for pages whose first section is a full-bleed hero meant to sit
  // behind the fixed nav bar (see NavBar's transparentAtTop) — that hero
  // adds its own equivalent top padding internally, so the rest of the
  // page ends up in the same place it would be otherwise.
  noTopPadding?: boolean;
}) {
  return (
    <div style={{ paddingTop: noTopPadding ? 0 : 68, minHeight: "100vh", background: "#F2EDE4" }}>
      {children}
    </div>
  );
}
