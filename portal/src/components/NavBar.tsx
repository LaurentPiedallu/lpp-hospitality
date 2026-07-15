"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import type { SessionPayload } from "@/lib/auth";

// Same email/sign-out opacity used to be 0.3 — measured at 2.47:1 contrast
// against the solid #12120F background alone, under WCAG AA's 4.5:1. Bumped
// to 0.55 (matches the same fix already applied to the property hero text).
const DIM_TEXT = "rgba(242,237,228,0.55)";

// Reuses the marketing site's transparent-over-hero, solid-on-scroll pattern
// (see script.js: `siteHeader.classList.toggle('nav-solid', scrollY > 72)`)
// — same threshold, same transition. Only used on pages with a full-bleed
// hero directly behind the nav (see PropertyHeader); everywhere else the
// nav stays solid, since most pages have no dark hero under it to overlay.
export default function NavBar({ session, transparentAtTop }: { session: SessionPayload; transparentAtTop?: boolean }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [solid, setSolid] = useState(!transparentAtTop);

  useEffect(() => {
    if (!transparentAtTop) return;
    const applyNavState = () => setSolid(window.scrollY > 72);
    applyNavState();
    window.addEventListener("scroll", applyNavState, { passive: true });
    return () => window.removeEventListener("scroll", applyNavState);
  }, [transparentAtTop]);

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
        background: solid ? "#12120F" : "transparent",
        backdropFilter: solid ? "blur(12px)" : "none",
        borderBottom: solid ? "1px solid rgba(184,147,90,0.1)" : "1px solid transparent",
        transition: "background-color .35s ease, border-color .35s ease, backdrop-filter .35s ease",
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
        {session.role === "admin" && (
          <Link
            href="/admin/publish-status"
            className="hover:text-[rgba(184,147,90,0.8)]"
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.105em",
              textTransform: "uppercase",
              color: "rgba(184,147,90,0.5)",
              textDecoration: "none",
              transition: "color .25s ease",
            }}
          >
            Publish Status
          </Link>
        )}
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 11,
            color: DIM_TEXT,
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
          className="hover:text-[rgba(242,237,228,0.9)]"
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.105em",
            textTransform: "uppercase",
            color: DIM_TEXT,
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
          {session.role === "admin" && (
            <Link
              href="/admin/publish-status"
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.105em",
                textTransform: "uppercase",
                color: "rgba(184,147,90,0.5)",
                textDecoration: "none",
                width: "fit-content",
              }}
            >
              Publish Status
            </Link>
          )}
          <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 11, color: "rgba(242,237,228,0.3)" }}>
            {session.email}
          </span>

          <a
            href="/api/auth/logout"
            className="hover:text-[rgba(242,237,228,0.9)]"
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.105em",
              textTransform: "uppercase",
              color: DIM_TEXT,
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
