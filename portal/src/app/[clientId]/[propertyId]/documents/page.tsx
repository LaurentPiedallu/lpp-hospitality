import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getBriefs, getUploads } from "@/lib/notion-queries";
import { formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import SubPageHeader from "@/components/SubPageHeader";
import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import type { Brief, Upload, UploadStatus, OverallHealth } from "@/types/portal";

// ─── Health styling ───────────────────────────────────────────────────────────

const HEALTH_VARIANT: Record<OverallHealth, "green" | "amber" | "red" | "gray"> = {
  Strong:    "green",
  Stable:    "green",
  "At Risk": "amber",
  Critical:  "red",
};

// ─── Upload status styling ────────────────────────────────────────────────────

const UPLOAD_VARIANT: Record<UploadStatus, "gray" | "amber" | "green"> = {
  "Pending":        "amber",
  "Processing":     "amber",
  "Processed":      "green",
  "Pending Review": "amber",
  "Reviewed":       "green",
  "Archived":       "gray",
};

// ─── Brief card ───────────────────────────────────────────────────────────────

function BriefCard({ brief }: { brief: Brief }) {
  const publishedLabel = brief.publishedDateStart ? formatPeriod(brief.publishedDateStart) : "—";
  const periodLabel    = brief.reportingPeriodStart ? formatPeriod(brief.reportingPeriodStart) : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{brief.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Published {publishedLabel}
            {periodLabel && <> · Period: {periodLabel}</>}
          </p>
        </div>
        {brief.overallHealth && (
          <StatusBadge label={brief.overallHealth} variant={HEALTH_VARIANT[brief.overallHealth]} />
        )}
      </div>

      {brief.executiveSummary && (
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{brief.executiveSummary}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <StatusBadge label={brief.confidence} variant="gray" />
        {brief.briefPageUrl ? (
          <a
            href={brief.briefPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition"
          >
            Open brief →
          </a>
        ) : (
          <span className="text-xs text-gray-300">No link</span>
        )}
      </div>
    </div>
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

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, briefs, uploads] = await Promise.all([
    getProperty(propertyId, clientId),
    getBriefs(clientId),
    getUploads(clientId, propertyId),
  ]);

  if (!property) notFound();

  const activeUploads   = uploads.filter((u) => u.status !== "Archived");
  const archivedUploads = uploads.filter((u) => u.status === "Archived");

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} clientId={clientId} propertyId={propertyId} />
      <SubPageHeader
        title="Documents"
        property={property}
        period={formatPeriod(null)}
        clientId={clientId}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* ── LPP Briefs ───────────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionHeader title="LPP Briefs" />

          {briefs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {briefs.map((b) => <BriefCard key={b.id} brief={b} />)}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400">No briefs published yet.</p>
              <p className="text-xs text-gray-300 mt-1">Briefs appear here after your LPP review session.</p>
            </div>
          )}
        </section>

        {/* ── Uploaded Files ───────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeader title="Uploaded Files" />
            <a
              href={`/${clientId}/${propertyId}/upload`}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition"
            >
              + Upload file
            </a>
          </div>

          {activeUploads.length > 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">File</th>
                      <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Uploaded</th>
                      <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Notes</th>
                      <th className="text-right px-5 py-3 text-xs text-gray-400 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUploads.map((u) => <UploadRow key={u.id} upload={u} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400">No files uploaded yet.</p>
              <p className="text-xs text-gray-300 mt-1">
                <a href={`/${clientId}/${propertyId}/upload`} className="text-blue-500 hover:underline">
                  Upload your first file
                </a>{" "}
                to share data with LPP.
              </p>
            </div>
          )}

          {archivedUploads.length > 0 && (
            <details className="bg-white rounded-xl border border-gray-100 overflow-hidden">
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
    </div>
  );
}
