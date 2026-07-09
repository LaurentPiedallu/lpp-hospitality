"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { SessionPayload } from "@/lib/auth";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const CREAM = "rgba(242,237,228,0.9)";
const GOLD = "#B8935A";

function useNavContext(pathname: string) {
  // Property-scoped routes look like /{clientId}/{propertyId}/{tab}
  const parts = pathname.split("/").filter(Boolean);
  const isPropertyRoute = parts.length >= 2 && parts[0] !== "dashboard" && parts[0] !== "login";
  const clientId = isPropertyRoute ? parts[0] : null;
  const propertyId = isPropertyRoute && parts.length >= 2 ? parts[1] : null;
  return { clientId, propertyId };
}

function NavLink({
  href,
  active,
  children,
  onClick,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        fontFamily: JOST,
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: active ? CREAM : "rgba(242,237,228,0.5)",
        textDecoration: "none",
        transition: "color 0.25s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = "rgba(242,237,228,0.8)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = "rgba(242,237,228,0.5)";
      }}
    >
      {children}
    </Link>
  );
}

export default function NavBar({ session }: { session: SessionPayload }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { clientId, propertyId } = useNavContext(pathname);

  const centerLinks: { href: string; label: string; active: boolean }[] = [
    { href: "/dashboard", label: "Dashboard", active: pathname === "/dashboard" },
  ];
  if (clientId && propertyId) {
    const uploadHref = `/${clientId}/${propertyId}/upload`;
    centerLinks.push({ href: uploadHref, label: "Upload", active: pathname === uploadHref });
  }

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        background: "#12120F",
        borderBottom: "1px solid rgba(184,147,90,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        aria-label="LPP Hospitality"
        style={{ width: 144, height: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "visible" }}
      >
        <Image
          src="/lpp-logo-transparent.png"
          alt="LPP Hospitality"
          width={144}
          height={42}
          style={{ width: "100%", height: "auto", objectFit: "contain" }}
          priority
        />
      </Link>

      {/* Center — desktop only */}
      <nav className="hidden md:flex" style={{ alignItems: "center", gap: 28 }} aria-label="Portal section navigation">
        {centerLinks.map((link) => (
          <NavLink key={link.href} href={link.href} active={link.active}>
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* Right side — desktop only */}
      <div className="hidden md:flex" style={{ alignItems: "center" }}>
        <a
          href="https://lpphospitality.com"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(184,147,90,0.5)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "color 0.25s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = GOLD)}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(184,147,90,0.5)")}
        >
          ← LPP
        </a>

        <span style={{ width: 1, height: 16, background: "rgba(242,237,228,0.1)", margin: "0 16px" }} />

        <span
          style={{
            fontSize: 11,
            color: "rgba(242,237,228,0.3)",
            fontFamily: JOST,
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.email}
        </span>

        <span style={{ width: 1, height: 16, background: "rgba(242,237,228,0.1)", margin: "0 16px" }} />

        <a
          href="/api/auth/logout"
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(242,237,228,0.28)",
            border: "1px solid rgba(242,237,228,0.1)",
            padding: "5px 10px",
            background: "transparent",
            borderRadius: 0,
            cursor: "pointer",
            transition: "all 0.25s ease",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgba(242,237,228,0.6)";
            e.currentTarget.style.borderColor = "rgba(242,237,228,0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(242,237,228,0.28)";
            e.currentTarget.style.borderColor = "rgba(242,237,228,0.1)";
          }}
        >
          Sign out
        </a>
      </div>

      {/* Hamburger — mobile only */}
      <button
        className="flex md:hidden"
        onClick={() => setDrawerOpen((v) => !v)}
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        style={{
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(242,237,228,0.4)",
          fontSize: 20,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        ☰
      </button>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="md:hidden"
          style={{
            position: "fixed",
            top: 52,
            left: 0,
            right: 0,
            background: "#12120F",
            borderBottom: "1px solid rgba(184,147,90,0.1)",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            zIndex: 100,
          }}
        >
          {centerLinks.map((link) => (
            <NavLink key={link.href} href={link.href} active={link.active} onClick={() => setDrawerOpen(false)}>
              {link.label}
            </NavLink>
          ))}

          <a
            href="https://lpphospitality.com"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: GOLD,
              textDecoration: "none",
              marginTop: 8,
            }}
          >
            ← Back to LPP
          </a>

          <span style={{ fontSize: 11, color: "rgba(242,237,228,0.3)", fontFamily: JOST }}>
            {session.email}
          </span>

          <a
            href="/api/auth/logout"
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(242,237,228,0.28)",
              border: "1px solid rgba(242,237,228,0.1)",
              padding: "5px 10px",
              background: "transparent",
              borderRadius: 0,
              cursor: "pointer",
              width: "fit-content",
              textDecoration: "none",
            }}
          >
            Sign out
          </a>
        </div>
      )}
    </header>
  );
}
