"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

interface UploadFormProps {
  clientId: string;
  propertyId: string;
  onSuccess?: () => void;
}

type Stage = "idle" | "uploading" | "polling" | "done" | "timeout" | "error";
type FileFormat = "CSV" | "PDF" | "Excel" | "";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

const ACCEPTED = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
].join(",");

const FORMAT_OPTIONS: { value: FileFormat; label: string }[] = [
  { value: "CSV",   label: "CSV" },
  { value: "PDF",   label: "PDF" },
  { value: "Excel", label: "Excel" },
];

function detectFormat(fileName: string): FileFormat {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf")                   return "PDF";
  if (ext === "csv")                   return "CSV";
  if (ext === "xlsx" || ext === "xls") return "Excel";
  return "";
}

function formatMismatch(format: FileFormat, fileName: string): string | null {
  if (!format) return null;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const allowed: Record<string, string[]> = {
    CSV:   ["csv"],
    PDF:   ["pdf"],
    Excel: ["xlsx", "xls"],
  };
  if (!allowed[format].includes(ext)) {
    return `You selected ${format} but the file is a .${ext}. Please correct the format or choose a different file.`;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: JOST,
  fontSize: 13,
  border: "1px solid rgba(18,18,15,0.12)",
  borderRadius: 0,
  padding: "12px 14px",
  background: "#FFFFFF",
  color: "#12120F",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: JOST,
  fontSize: 9,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(18,18,15,0.4)",
  marginBottom: 8,
};

export default function UploadForm({ clientId, propertyId, onSuccess }: UploadFormProps) {
  const [file, setFile]             = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<FileFormat>("");
  const [uploadType, setUploadType] = useState("");
  const [reportingPeriod, setReportingPeriod] = useState("");
  const [notes, setNotes]           = useState("");
  const [stage, setStage]           = useState<Stage>("idle");
  const [progress, setProgress]     = useState(0);
  const [errorMsg, setErrorMsg]     = useState("");
  const [dragging, setDragging]     = useState(false);
  const [pollStatus, setPollStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef(0);
  const router = useRouter();

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const pollUploadStatus = useCallback((notionPageId: string) => {
    pollStartRef.current = Date.now();

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/upload/status?id=${encodeURIComponent(notionPageId)}&clientId=${encodeURIComponent(clientId)}`
        );
        if (res.ok) {
          const data = (await res.json()) as { status: string };
          if (data.status === "Processed" || data.status === "Published") {
            setStage("done");
            router.refresh();
            onSuccess?.();
            return;
          }
          if (data.status === "Failed") {
            setStage("error");
            setErrorMsg("Something went wrong while processing this file · contact LPP if this persists");
            return;
          }
          setPollStatus(data.status);
        }
      } catch {
        // Transient network error — keep polling rather than failing the wait.
      }

      if (Date.now() - pollStartRef.current >= POLL_TIMEOUT_MS) {
        setStage("timeout");
        return;
      }

      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();
  }, [clientId, router, onSuccess]);

  const handleFile = (f: File) => {
    setFile(f);
    setFileFormat(detectFormat(f.name));
    setStage("idle");
    setErrorMsg("");
    setProgress(0);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const submit = async () => {
    if (!file) return;

    // Client-side format validation
    if (!fileFormat) {
      setErrorMsg("Please select a file format.");
      setStage("error");
      return;
    }
    const mismatch = formatMismatch(fileFormat, file.name);
    if (mismatch) {
      setErrorMsg(mismatch);
      setStage("error");
      return;
    }

    setErrorMsg("");
    setStage("uploading");
    setProgress(0);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      fd.append("propertyId", propertyId);
      fd.append("fileFormat", fileFormat);
      if (uploadType)         fd.append("uploadType", uploadType);
      if (reportingPeriod)    fd.append("reportingPeriod", reportingPeriod + "-01");
      if (notes.trim())       fd.append("notes", notes.trim());

      const res = await fetch("/api/upload/presign", { method: "POST", body: fd });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let message = "Upload failed";
        try { message = (JSON.parse(text) as { error?: string }).error ?? message; } catch { message = text || message; }
        throw new Error(message);
      }

      const data = (await res.json()) as { notionPageId: string };
      setProgress(100);
      setStage("polling");
      setPollStatus("Pending");
      router.refresh();
      pollUploadStatus(data.notionPageId);

    } catch (err) {
      setStage("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const reset = () => {
    stopPolling();
    setFile(null);
    setFileFormat("");
    setUploadType("");
    setReportingPeriod("");
    setNotes("");
    setStage("idle");
    setProgress(0);
    setErrorMsg("");
    setPollStatus("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const resetButton = (
    <button
      onClick={reset}
      className="hover:text-[#12120F]"
      style={{
        marginTop: 12,
        fontFamily: JOST,
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: GOLD,
        background: "none",
        border: "none",
        cursor: "pointer",
        transition: "color 0.25s ease",
      }}
    >
      Upload another file
    </button>
  );

  if (stage === "polling") {
    const analyzing = pollStatus !== "Pending";
    return (
      <div style={{ background: "rgba(184,147,90,0.06)", border: "1px solid rgba(184,147,90,0.2)", borderRadius: 0, padding: 32, textAlign: "center" }}>
        <p style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 400, color: "#12120F", marginBottom: analyzing ? 8 : 16 }}>
          {analyzing ? "Analyzing your data" : "Uploading file…"}
        </p>
        {analyzing && (
          <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.5)", marginBottom: 16 }}>
            This usually takes 1 to 2 minutes
          </p>
        )}
        <div style={{ height: 3, background: "rgba(18,18,15,0.08)", overflow: "hidden", maxWidth: 240, margin: "0 auto" }}>
          <div className="animate-pulse" style={{ height: "100%", width: "100%", background: GOLD }} />
        </div>
      </div>
    );
  }

  if (stage === "timeout") {
    return (
      <div style={{ background: "rgba(184,147,90,0.06)", border: "1px solid rgba(184,147,90,0.2)", borderRadius: 0, padding: 32, textAlign: "center" }}>
        <p style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 400, color: "#12120F", marginBottom: 8 }}>
          Still working on it
        </p>
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.5)" }}>
          This is taking longer than usual · we&apos;ll keep working on it, feel free to check back
        </p>
        {resetButton}
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div style={{ background: "rgba(184,147,90,0.06)", border: "1px solid rgba(184,147,90,0.2)", borderRadius: 0, padding: 32, textAlign: "center" }}>
        <p style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 400, color: "#12120F", marginBottom: 8 }}>
          File processed successfully
        </p>
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.5)" }}>
          Your data has been analyzed and is ready for review
        </p>
        {resetButton}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          position: "relative",
          border: `2px dashed ${dragging ? "rgba(184,147,90,0.4)" : "rgba(18,18,15,0.12)"}`,
          borderRadius: 0,
          padding: 32,
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(184,147,90,0.03)" : "rgba(18,18,15,0.02)",
          transition: "border-color 0.25s ease, background 0.25s ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={onInputChange}
          className="sr-only"
        />

        {file ? (
          <div>
            <p style={{ fontFamily: SERIF, fontSize: "1.1rem", color: "#12120F", marginBottom: 4 }}>{file.name}</p>
            <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.4)" }}>{formatBytes(file.size)}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="hover:text-[#C0392B]"
              style={{ marginTop: 8, fontFamily: JOST, fontSize: 11, color: "rgba(192,57,43,0.7)", background: "none", border: "none", cursor: "pointer" }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: GOLD, marginBottom: 8 }}>
              Upload file
            </p>
            <p style={{ fontFamily: SERIF, fontSize: "1.1rem", color: "#12120F", marginBottom: 6 }}>
              Click to browse or drag and drop
            </p>
            <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.4)", lineHeight: 1.6 }}>
              PDF, Excel, CSV, PowerPoint, PNG, JPG · Max 50 MB
            </p>
            <button
              type="button"
              className="hover:border-[rgba(184,147,90,0.4)] hover:text-[#B8935A]"
              style={{
                marginTop: 16,
                fontFamily: JOST,
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                border: "1px solid rgba(18,18,15,0.2)",
                color: "rgba(18,18,15,0.6)",
                background: "transparent",
                padding: "8px 18px",
                cursor: "pointer",
                transition: "all 0.25s ease",
              }}
            >
              Choose file
            </button>
          </div>
        )}
      </div>

      {/* File Format + Upload Type */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle}>
            File format <span style={{ color: "#C0392B" }}>*</span>
          </label>
          <select value={fileFormat} onChange={(e) => setFileFormat(e.target.value as FileFormat)} style={selectStyle}>
            <option value="">Select format…</option>
            {FORMAT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>
            Upload type <span style={{ color: "rgba(18,18,15,0.35)", textTransform: "none", letterSpacing: 0 }}>(optional)</span>
          </label>
          <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} style={selectStyle}>
            <option value="">Select type…</option>
            {["P&L","POS Sales","Labor / Payroll","Menu Mix","Budget","Guest Reviews","Reservations","Inventory","Menu Engineering","Other"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Reporting Period */}
      <div>
        <label style={labelStyle}>
          Reporting period <span style={{ color: "rgba(18,18,15,0.35)", textTransform: "none", letterSpacing: 0 }}>(optional)</span>
        </label>
        <input
          type="month"
          value={reportingPeriod}
          onChange={(e) => setReportingPeriod(e.target.value)}
          style={selectStyle}
        />
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>
          Notes <span style={{ color: "rgba(18,18,15,0.35)", textTransform: "none", letterSpacing: 0 }}>(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. March P&L — includes adjusted labor numbers"
          className="placeholder:text-[rgba(18,18,15,0.3)]"
          style={{ ...selectStyle, resize: "none" }}
        />
      </div>

      {/* Progress bar */}
      {stage === "uploading" && (
        <div>
          <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.5)", marginBottom: 6 }}>Uploading…</p>
          <div style={{ height: 3, background: "rgba(18,18,15,0.08)", overflow: "hidden" }}>
            <div className="animate-pulse" style={{ height: "100%", width: "100%", background: GOLD }} />
          </div>
        </div>
      )}

      {/* Error */}
      {stage === "error" && errorMsg && (
        <div style={{ background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.2)", borderRadius: 0, padding: "12px 16px" }}>
          <p style={{ fontFamily: JOST, fontSize: 12, color: "#C0392B" }}>{errorMsg}</p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={submit}
        disabled={!file || stage === "uploading"}
        className="hover:bg-[#D4AF7A]"
        style={{
          width: "100%",
          padding: "13px 24px",
          background: GOLD,
          color: "#12120F",
          fontFamily: JOST,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          border: "none",
          borderRadius: 0,
          cursor: !file || stage === "uploading" ? "not-allowed" : "pointer",
          opacity: !file || stage === "uploading" ? 0.4 : 1,
          transition: "background 0.25s ease",
        }}
      >
        {stage === "uploading" ? "Uploading…" : "Upload file"}
      </button>
    </div>
  );
}
