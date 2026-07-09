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
  color,
  activeColor,
  hoverColor,
  children,
  onClick,
}: {
  href: string;
  active: boolean;
  color?: string;
  activeColor?: string;
  hoverColor?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const base = color ?? "rgba(242,237,228,0.5)";
  const activeC = activeColor ?? CREAM;
  const hover = hoverColor ?? "rgba(242,237,228,0.8)";
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        fontFamily: JOST,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: active ? activeC : base,
        textDecoration: "none",
        transition: "color 0.25s ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = hover;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = base;
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

  const sectionLinks: { href: string; label: string; active: boolean }[] = [
    { href: "/dashboard", label: "Dashboard", active: pathname === "/dashboard" },
  ];
  if (clientId && propertyId) {
    const uploadHref = `/${clientId}/${propertyId}/upload`;
    sectionLinks.push({ href: uploadHref, label: "Upload", active: pathname === uploadHref });
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
        style={{ height: 52, display: "inline-flex", alignItems: "center", flexShrink: 0 }}
      >
        <Image
          src="/lpp-logo-transparent.png"
          alt="LPP Hospitality"
          width={1251}
          height={454}
          style={{ height: 30, width: "auto", objectFit: "contain" }}
          priority
        />
      </Link>

      {/* Everything else — grouped together on the right, like the main site */}
      <div className="hidden md:flex" style={{ alignItems: "center", gap: 28 }}>
        {sectionLinks.map((link) => (
          <NavLink key={link.href} href={link.href} active={link.active}>
            {link.label}
          </NavLink>
        ))}

        <NavLink
          href="https://lpphospitality.com"
          active={false}
          color="rgba(184,147,90,0.5)"
          hoverColor={GOLD}
        >
          ← LPP
        </NavLink>

        <span
          style={{
            fontSize: 11,
            fontWeight: 400,
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

        <a
          href="/api/auth/logout"
          style={{
            fontFamily: JOST,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(242,237,228,0.4)",
            textDecoration: "none",
            transition: "color 0.25s ease",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(242,237,228,0.8)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(242,237,228,0.4)")}
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
          {sectionLinks.map((link) => (
            <NavLink key={link.href} href={link.href} active={link.active} onClick={() => setDrawerOpen(false)}>
              {link.label}
            </NavLink>
          ))}

          <NavLink
            href="https://lpphospitality.com"
            active={false}
            color="rgba(184,147,90,0.5)"
            activeColor={GOLD}
            hoverColor={GOLD}
          >
            ← Back to LPP
          </NavLink>

          <span style={{ fontSize: 11, color: "rgba(242,237,228,0.3)", fontFamily: JOST }}>
            {session.email}
          </span>

          <a
            href="/api/auth/logout"
            style={{
              fontFamily: JOST,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(242,237,228,0.4)",
              textDecoration: "none",
              width: "fit-content",
            }}
          >
            Sign out
          </a>
        </div>
      )}
    </header>
  );
}
