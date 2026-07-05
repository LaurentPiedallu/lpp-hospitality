"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const GOLD = "#B8935A";

function LoginNav() {
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        height: 52,
        minHeight: 52,
        background: "transparent",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        borderBottom: "none",
        boxShadow: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        overflow: "visible",
      }}
    >
      <a
        href="https://lpphospitality.com"
        aria-label="LPP Hospitality"
        style={{ width: 144, height: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "visible" }}
      >
        <Image
          src="/lpp-logo-transparent.png"
          alt="LPP Hospitality"
          width={144}
          height={42}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          priority
        />
      </a>
      <a
        href="https://lpphospitality.com"
        className="hover:text-[rgba(242,237,228,0.6)]"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(242,237,228,0.3)",
          textDecoration: "none",
          transition: "color .25s ease",
        }}
      >
        lpphospitality.com
      </a>
    </header>
  );
}

export default function LoginForm({
  errorMessages,
}: {
  errorMessages: Record<string, string>;
}) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code && errorMessages[code]) {
      setError(errorMessages[code]);
    }
  }, [errorMessages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/send-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", width: "100%" }}>
      {/* Background image */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }} aria-hidden="true">
        <Image
          src="/lpp-login-bg.png"
          alt=""
          fill
          priority
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
      </div>

      {/* Overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 50% 60% at 40% 55%, rgba(12,10,8,0.25) 0%, transparent 70%), linear-gradient(to top, rgba(12,10,8,0.7) 0%, transparent 40%), rgba(12,10,8,0.55)",
        }}
      />

      <LoginNav />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          width: "100%",
          paddingTop: 52,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <div
          className="w-full max-[479px]:w-[calc(100%-48px)] max-[479px]:mx-6"
          style={{
            background: "rgba(12,10,8,0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(242,237,228,0.08)",
            borderRadius: 0,
            padding: "52px 52px 44px 52px",
            maxWidth: 420,
          }}
        >
          {submitted ? (
            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: "clamp(2rem, 3.5vw, 3rem)",
                  fontWeight: 300,
                  color: "rgba(242,237,228,0.92)",
                  lineHeight: 1.1,
                  marginBottom: 12,
                }}
              >
                Check your inbox.
              </p>
              <p style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, color: "rgba(242,237,228,0.45)", lineHeight: 1.7 }}>
                We sent a sign-in link to <span style={{ color: "rgba(242,237,228,0.7)" }}>{email}</span>. The link expires in 15 minutes.
              </p>
              <button
                onClick={() => { setSubmitted(false); setEmail(""); }}
                className="hover:text-[rgba(242,237,228,0.6)]"
                style={{
                  marginTop: 20,
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: 12,
                  color: "rgba(242,237,228,0.35)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "color .25s ease",
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <p
                style={{
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: 9,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: GOLD,
                  marginBottom: 14,
                }}
              >
                Client Portal
              </p>
              <h1
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: "clamp(2.4rem, 4vw, 3.2rem)",
                  fontWeight: 300,
                  color: "rgba(242,237,228,0.92)",
                  lineHeight: 1.1,
                  marginBottom: 16,
                }}
              >
                Sign in to your portal
              </h1>
              <p
                style={{
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: 14,
                  fontWeight: 300,
                  color: "rgba(242,237,228,0.55)",
                  lineHeight: 1.7,
                  marginBottom: 24,
                }}
              >
                Your properties and performance reports are waiting.
              </p>
              <p
                style={{
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: 13,
                  color: "rgba(242,237,228,0.45)",
                  lineHeight: 1.7,
                  marginBottom: 20,
                }}
              >
                Enter your email and we&apos;ll send a secure sign-in link. No password needed.
              </p>

              {error && (
                <div
                  className="mb-4 px-4 py-3 flex gap-3 items-start"
                  style={{ background: "rgba(192,57,43,0.1)", border: "1px solid rgba(192,57,43,0.3)" }}
                >
                  <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8A69C" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, color: "#E8A69C" }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <label
                  htmlFor="email"
                  style={{
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: 9,
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    color: "rgba(242,237,228,0.4)",
                    marginBottom: 8,
                    display: "block",
                  }}
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="focus:border-[rgba(184,147,90,0.5)] focus:bg-[rgba(242,237,228,0.07)] placeholder:text-[rgba(242,237,228,0.3)]"
                  style={{
                    width: "100%",
                    background: "rgba(242,237,228,0.05)",
                    border: "1px solid rgba(242,237,228,0.15)",
                    borderRadius: 0,
                    color: "rgba(242,237,228,0.9)",
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: 14,
                    fontWeight: 300,
                    padding: "13px 16px",
                    outline: "none",
                    transition: "border-color .25s ease, background .25s ease",
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="hover:bg-[#D4AF7A]"
                  style={{
                    width: "100%",
                    background: GOLD,
                    border: "none",
                    borderRadius: 0,
                    color: "#12120F",
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    padding: 15,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.6 : 1,
                    marginTop: 12,
                    transition: "background .25s ease",
                  }}
                >
                  {loading ? "Sending…" : "Send sign-in link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 12,
            fontWeight: 300,
            color: "rgba(242,237,228,0.55)",
            letterSpacing: "0.02em",
            textAlign: "center",
            marginTop: 24,
          }}
        >
          For access, contact{" "}
          <a
            href="mailto:laurent@lpphospitality.com"
            className="hover:text-[#D4AF7A]"
            style={{ color: GOLD, fontSize: 12, textDecoration: "none", transition: "color .25s ease" }}
          >
            laurent@lpphospitality.com
          </a>
        </p>
      </div>
    </div>
  );
}
