import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getBriefs, getUploads, getLatestKpiSummary } from "@/lib/notion-queries";
import { formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import UploadForm from "@/components/UploadForm";
import EmptyState from "@/components/EmptyState";
import type { Brief, Upload, UploadStatus } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

// ─── Upload status styling ────────────────────────────────────────────────────

const UPLOAD_VARIANT: Record<UploadStatus, "gray" | "amber" | "green" | "red"> = {
  Uploaded:       "gray",
  Pending:        "gray",
  Processing:     "amber",
  "In Progress":  "amber",
  "Needs Review": "amber",
  Processed:      "green",
  Published:      "green",
  Failed:         "red",
  Archived:       "gray",
};

// ─── Brief row ──────────────────────────────────────────────────────────────

function BriefCard({ brief }: { brief: Brief }) {
  const publishedLabel = brief.publishedDateStart ? formatPeriod(brief.publishedDateStart) : "—";
  const periodLabel    = brief.reportingPeriodStart ? formatPeriod(brief.reportingPeriodStart) : null;

  const content = (
    <div
      className="group flex items-start justify-between gap-4 hover:border-[rgba(184,147,90,0.25)]"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(18,18,15,0.08)",
        borderRadius: 0,
        padding: "24px 32px",
        marginBottom: 8,
        transition: "border-color 0.25s ease",
        cursor: brief.briefPageUrl ? "pointer" : "default",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 6 }}>
          Published {publishedLabel}{periodLabel && ` · Period: ${periodLabel}`}
        </p>
        <h3 style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 400, color: "#12120F" }}>{brief.title}</h3>
        {brief.executiveSummary && (
          <p
            style={{
              fontFamily: JOST,
              fontSize: 12,
              color: "rgba(18,18,15,0.45)",
              marginTop: 6,
              lineHeight: 1.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brief.executiveSummary}
          </p>
        )}
      </div>
      {brief.briefPageUrl && (
        <span
          style={{
            fontFamily: JOST,
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(18,18,15,0.35)",
            flexShrink: 0,
          }}
        >
          Read →
        </span>
      )}
    </div>
  );

  return brief.briefPageUrl ? (
    <a href={brief.briefPageUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
      {content}
    </a>
  ) : (
    content
  );
}

// ─── Upload row ───────────────────────────────────────────────────────────────

function UploadRow({ upload: u }: { upload: Upload }) {
  const date = u.uploadedAt ? formatPeriod(u.uploadedAt) : "—";
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
      <td className="px-5 py-3 text-sm text-gray-700">
        {u.fileUrl ? (
          <a
            href={u.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 transition"
          >
            {u.fileName || "Untitled file"}
          </a>
        ) : (
          <span>{u.fileName || "Untitled file"}</span>
        )}
      </td>
      <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{date}</td>
      <td className="px-5 py-3 text-xs text-gray-500 max-w-xs truncate">{u.notes || "—"}</td>
      <td className="px-5 py-3 text-right">
        <StatusBadge label={u.status} variant={UPLOAD_VARIANT[u.status]} />
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function UploadPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, briefs, uploads, kpi] = await Promise.all([
    getProperty(propertyId, clientId),
    getBriefs(clientId),
    getUploads(clientId, propertyId),
    getLatestKpiSummary(propertyId),
  ]);
  if (!property) notFound();

  const activeUploads   = uploads.filter((u) => u.status !== "Archived");
  const archivedUploads = uploads.filter((u) => u.status === "Archived");

  return (
    <PageWrapper>
      <NavBar session={session} />
      <PropertyHeader property={property} kpi={kpi} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="upload" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-8">

        {/* Page header */}
        <div style={{ marginBottom: 4 }}>
          <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: "#B8935A", marginBottom: 10 }}>
            Data Upload
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(1.8rem, 2.5vw, 2.2rem)", fontWeight: 300, color: "#12120F", marginBottom: 12 }}>
            Upload data
          </h1>
          <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.5)", lineHeight: 1.8, maxWidth: 520 }}>
            Upload your monthly performance files below. Once received, LPP will process your
            data and update your Financial Review and Executive Brief within one business day.
          </p>
        </div>

        {/* Guidance */}
        <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 24 }} className="space-y-4">
          <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.55)", lineHeight: 1.7 }}>
            Share your raw data files with LPP so we can keep your portal current. All uploads are
            reviewed by your LPP team before any numbers appear in the portal.
          </p>
          <ul className="space-y-2">
            {[
              ["P&L / Income statement", "Monthly or period-end PDF or Excel"],
              ["Labor reports",          "Scheduling system exports — CSV or Excel"],
              ["POS sales data",         "Daily/weekly exports from your POS"],
              ["Guest feedback",         "Review exports, survey results"],
              ["Any other data",         "If you're not sure, upload it and add a note"],
            ].map(([label, desc]) => (
              <li key={label} style={{ display: "flex", gap: 10, fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.55)" }}>
                <span style={{ color: "#B8935A" }}>→</span>
                <span><span style={{ color: "#12120F" }}>{label}</span> — {desc}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Upload form */}
        <section className="space-y-4">
          <SectionHeader title="Upload a file" />
          <UploadForm clientId={clientId} propertyId={propertyId} />
        </section>

        {/* ── LPP Briefs ───────────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionHeader title="LPP Briefs" />

          {briefs.length > 0 ? (
            <div>
              {briefs.map((b) => <BriefCard key={b.id} brief={b} />)}
            </div>
          ) : (
            <EmptyState
              title="No briefs yet"
              body="Executive briefs will appear here after your first data upload and analysis cycle is complete."
            />
          )}
        </section>

        {/* ── Uploaded Files ───────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionHeader title="Uploaded Files" />

          {activeUploads.length > 0 ? (
            <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(18,18,15,0.08)]">
                      <th style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)" }} className="text-left px-5 py-3 font-medium">File</th>
                      <th style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)" }} className="text-left px-5 py-3 font-medium">Uploaded</th>
                      <th style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)" }} className="text-left px-5 py-3 font-medium">Notes</th>
                      <th style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)" }} className="text-right px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.65)" }}>
                    {activeUploads.map((u) => <UploadRow key={u.id} upload={u} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No files uploaded yet"
              body="Upload your first file above to share data with LPP."
            />
          )}

          {archivedUploads.length > 0 && (
            <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
              <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-500 flex items-center justify-between select-none hover:bg-gray-50 transition">
                <span>Archived files ({archivedUploads.length})</span>
                <span className="text-gray-400 text-xs">▼</span>
              </summary>
              <div className="border-t border-gray-50 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50 bg-gray-50">
                      <th className="text-left px-5 py-2.5 text-xs text-gray-400 font-medium">File</th>
                      <th className="text-left px-5 py-2.5 text-xs text-gray-400 font-medium">Uploaded</th>
                      <th className="text-left px-5 py-2.5 text-xs text-gray-400 font-medium">Notes</th>
                      <th className="text-right px-5 py-2.5 text-xs text-gray-400 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedUploads.map((u) => <UploadRow key={u.id} upload={u} />)}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>

      </div>
    </PageWrapper>
  );
}
