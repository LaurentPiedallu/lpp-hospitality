"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SessionPayload } from "@/lib/auth";

const GOLD = "#B8935A";

const LINK_STYLE: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "rgba(242,237,228,0.55)",
  padding: "6px 10px",
  borderRadius: 2,
  transition: "color .2s ease, background-color .2s ease",
};

function LogoBox() {
  return (
    <Link
      href="/dashboard"
      aria-label="LPP Hospitality — back to dashboard"
      className="shrink-0"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid rgba(184,147,90,0.5)",
        padding: "4px 10px 5px",
        lineHeight: 1,
      }}
    >
      <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 13, color: GOLD, letterSpacing: "0.08em" }}>
        L.P.P.
      </span>
      <span style={{ fontSize: 7, letterSpacing: "0.22em", color: "rgba(184,147,90,0.55)", marginTop: 2 }}>
        HOSPITALITY
      </span>
    </Link>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      {open ? (
        <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ) : (
        <>
          <line x1="1" y1="4.5" x2="17" y2="4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="1" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="1" y1="13.5" x2="17" y2="13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export default function NavBar({
  session,
  clientId,
  propertyId,
}: {
  session: SessionPayload;
  clientId?: string;
  propertyId?: string;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const links: { label: string; href: string }[] = [{ label: "Dashboard", href: "/dashboard" }];
  if (clientId && propertyId) {
    links.push({ label: "Reports", href: `/${clientId}/${propertyId}/documents` });
    links.push({ label: "Upload", href: `/${clientId}/${propertyId}/upload` });
  }

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between px-4 md:px-6"
      style={{ height: 52, background: "#12120F" }}
    >
      <LogoBox />

      <nav className="hidden md:flex items-center gap-1">
        {links.map((link) => {
          const active = link.href === "/dashboard"
            ? pathname === link.href
            : pathname?.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                ...LINK_STYLE,
                color: active ? "rgba(242,237,228,0.9)" : LINK_STYLE.color,
                backgroundColor: active ? "rgba(242,237,228,0.06)" : "transparent",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden md:flex items-center gap-4">
        <a
          href="https://lpphospitality.com"
          style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(184,147,90,0.5)" }}
        >
          ← LPP
        </a>
        <span aria-hidden style={{ width: 1, height: 20, background: "rgba(242,237,228,0.1)" }} />
        <span style={{ fontSize: 11, color: "rgba(242,237,228,0.35)" }}>{session.email}</span>
        <a
          href="/api/auth/logout"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "rgba(242,237,228,0.3)",
            border: "1px solid rgba(242,237,228,0.1)",
            padding: "5px 10px",
            borderRadius: 3,
          }}
        >
          Sign out
        </a>
      </div>

      <button
        className="md:hidden flex items-center justify-center"
        aria-label={drawerOpen ? "Close menu" : "Open menu"}
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((v) => !v)}
        style={{ background: "none", border: "none", color: "rgba(242,237,228,0.4)", width: 32, height: 32 }}
      >
        <HamburgerIcon open={drawerOpen} />
      </button>

      {drawerOpen && (
        <div
          className="md:hidden flex flex-col"
          style={{ position: "fixed", inset: "52px 0 auto 0", background: "#12120F", zIndex: 30, padding: "16px 16px 24px", gap: 2 }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              style={{ ...LINK_STYLE, padding: "13px 4px", fontSize: 12 }}
            >
              {link.label}
            </Link>
          ))}
          <div aria-hidden style={{ height: 1, background: "rgba(242,237,228,0.1)", margin: "10px 0" }} />
          <span style={{ fontSize: 11, color: "rgba(242,237,228,0.35)", padding: "0 4px 4px" }}>{session.email}</span>
          <a
            href="/api/auth/logout"
            onClick={() => setDrawerOpen(false)}
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(242,237,228,0.3)", padding: "10px 4px" }}
          >
            Sign out
          </a>
          <a
            href="https://lpphospitality.com"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: GOLD, padding: "16px 4px 4px", marginTop: 4 }}
          >
            ← Back to LPP
          </a>
        </div>
      )}
    </header>
  );
}
