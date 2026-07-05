"use client";

import { useState, useEffect } from "react";

const GOLD = "#B8935A";

function LogoBox() {
  return (
    <a
      href="https://lpphospitality.com"
      aria-label="LPP Hospitality"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid rgba(184,147,90,0.5)",
        padding: "6px 14px 7px",
        lineHeight: 1,
      }}
    >
      <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, color: GOLD, letterSpacing: "0.08em" }}>
        L.P.P.
      </span>
      <span style={{ fontSize: 8, letterSpacing: "0.22em", color: "rgba(184,147,90,0.55)", marginTop: 3 }}>
        HOSPITALITY
      </span>
    </a>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(242,237,228,0.04)",
  border: "1px solid rgba(242,237,228,0.12)",
  color: "rgba(242,237,228,0.85)",
  borderRadius: 3,
  padding: "13px 16px",
  fontSize: 14,
  fontFamily: "Inter, system-ui, sans-serif",
  outline: "none",
  transition: "border-color .2s ease",
};

export default function LoginForm({
  errorMessages,
}: {
  errorMessages: Record<string, string>;
}) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16" style={{ background: "#12120F" }}>
      <div className="w-full" style={{ maxWidth: 380 }}>
        <div className="flex justify-center">
          <LogoBox />
        </div>

        <h1
          className="text-center"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 300,
            fontSize: 32,
            color: "#F2EDE4",
            marginTop: 32,
            marginBottom: 12,
          }}
        >
          {submitted ? "Check your inbox." : "Welcome to Prometheus"}
        </h1>
        <p
          className="text-center"
          style={{ fontSize: 13, color: "rgba(242,237,228,0.45)", marginBottom: 32, lineHeight: 1.7 }}
        >
          {submitted ? (
            <>
              We sent a sign-in link to <span style={{ color: "rgba(242,237,228,0.7)" }}>{email}</span>. The link expires in 15 minutes.
            </>
          ) : (
            "Sign in to access your client intelligence portal."
          )}
        </p>

        {submitted ? (
          <button
            onClick={() => { setSubmitted(false); setEmail(""); }}
            style={{ display: "block", margin: "0 auto", fontSize: 12, color: "rgba(242,237,228,0.4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Use a different email →
          </button>
        ) : (
          <>
            {error && (
              <div
                className="mb-4 px-4 py-3 flex gap-3 items-start"
                style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 3 }}
              >
                <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C0392B" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p style={{ fontSize: 13, color: "#E8A69C" }}>{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 12 }}>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="you@company.com"
                aria-label="Email address"
                style={{
                  ...inputStyle,
                  borderColor: focused ? "rgba(184,147,90,0.5)" : "rgba(242,237,228,0.12)",
                }}
                className="placeholder:text-[rgba(242,237,228,0.25)]"
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  background: GOLD,
                  color: "#12120F",
                  border: "none",
                  padding: "14px",
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: ".18em",
                  borderRadius: 2,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontWeight: 600,
                }}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </>
        )}

        <p className="mt-8 text-center" style={{ fontSize: 11, color: "rgba(242,237,228,0.25)" }}>
          Not a client yet?{" "}
          <a href="https://lpphospitality.com/#contact" style={{ color: "rgba(184,147,90,0.6)" }}>
            Get in touch →
          </a>
        </p>
      </div>
    </div>
  );
}
