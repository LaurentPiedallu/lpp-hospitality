"use client";

import { useState, useRef, useCallback } from "react";

interface UploadFormProps {
  clientId: string;
  propertyId: string;
  onSuccess?: () => void;
}

type Stage = "idle" | "uploading" | "done" | "error";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadForm({ clientId, propertyId, onSuccess }: UploadFormProps) {
  const [file, setFile]       = useState<File | null>(null);
  const [notes, setNotes]     = useState("");
  const [stage, setStage]     = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
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
    setErrorMsg("");
    setStage("uploading");
    setProgress(0);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      fd.append("propertyId", propertyId);
      if (notes.trim()) fd.append("notes", notes.trim());

      const res = await fetch("/api/upload/presign", { method: "POST", body: fd });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Upload failed");
      }

      setStage("done");
      setProgress(100);
      onSuccess?.();

    } catch (err) {
      setStage("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const reset = () => {
    setFile(null);
    setNotes("");
    setStage("idle");
    setProgress(0);
    setErrorMsg("");
    if (inputRef.current) inputRef.current.value = "";
  };

  if (stage === "done") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center space-y-3">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-green-600 text-xl">✓</span>
        </div>
        <p className="text-sm font-semibold text-green-800">File uploaded successfully</p>
        <p className="text-xs text-green-600">
          Your file has been sent to LPP for review. You'll see it in your Documents page shortly.
        </p>
        <button
          onClick={reset}
          className="mt-2 text-xs font-medium text-green-700 hover:text-green-800 underline underline-offset-2"
        >
          Upload another file
        </button>
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
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition
          ${dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={onInputChange}
          className="sr-only"
        />

        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="text-xs text-red-400 hover:text-red-500 mt-1"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-blue-600">Click to browse</span> or drag and drop
            </p>
            <p className="text-xs text-gray-400">PDF, Excel, CSV, PowerPoint, PNG, JPG · Max 50 MB</p>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. March P&L — includes adjusted labor numbers"
          className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition placeholder:text-gray-300"
        />
      </div>

      {/* Progress bar */}
      {stage === "uploading" && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Uploading…</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse w-full" />
          </div>
        </div>
      )}

      {/* Error */}
      {stage === "error" && errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={submit}
        disabled={!file || stage === "uploading"}
        className="w-full py-3 px-6 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {stage === "uploading" ? "Uploading…" : "Upload file"}
      </button>
    </div>
  );
}
