"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { SessionPayload } from "@/lib/auth";

export default function NavBar({ session }: { session: SessionPayload }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 68,
        minHeight: 68,
        background: "#12120F",
        borderBottom: "1px solid rgba(184,147,90,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 clamp(22px, 5vw, 62px)",
        overflow: "visible",
      }}
    >
      {/* Logo — exact box/sizing copied from the login page nav */}
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

      {/* Right side — desktop only */}
      <div className="hidden md:flex" style={{ alignItems: "center", gap: 20 }}>
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 11,
            color: "rgba(242,237,228,0.3)",
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
          className="hover:text-[rgba(242,237,228,0.55)]"
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.105em",
            textTransform: "uppercase",
            color: "rgba(242,237,228,0.3)",
            textDecoration: "none",
            transition: "color .25s ease",
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
            top: 68,
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
          <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 11, color: "rgba(242,237,228,0.3)" }}>
            {session.email}
          </span>

          <a
            href="/api/auth/logout"
            className="hover:text-[rgba(242,237,228,0.55)]"
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.105em",
              textTransform: "uppercase",
              color: "rgba(242,237,228,0.3)",
              textDecoration: "none",
              width: "fit-content",
              transition: "color .25s ease",
            }}
          >
            Sign out
          </a>
        </div>
      )}
    </header>
  );
}
