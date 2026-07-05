import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getUploads } from "@/lib/notion-queries";
import { formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import SubPageHeader from "@/components/SubPageHeader";
import UploadForm from "@/components/UploadForm";
import StatusBadge from "@/components/StatusBadge";
import type { Upload, UploadStatus } from "@/types/portal";

const UPLOAD_VARIANT: Record<UploadStatus, "gray" | "amber" | "green"> = {
  "Pending":        "amber",
  "Processing":     "amber",
  "Processed":      "green",
  "Pending Review": "amber",
  "Reviewed":       "green",
  "Archived":       "gray",
};

function UploadRow({ upload: u }: { upload: Upload }) {
  const date = u.uploadedAt ? formatPeriod(u.uploadedAt) : "—";
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
      <td className="px-5 py-3 text-sm text-gray-700">
        {u.fileUrl ? (
          <a href={u.fileUrl} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 transition">
            {u.fileName || "Untitled file"}
          </a>
        ) : (
          <span>{u.fileName || "Untitled file"}</span>
        )}
      </td>
      <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{date}</td>
      <td className="px-5 py-3 text-xs text-gray-500 max-w-xs truncate">{u.notes || "—"}</td>
      <td className="px-5 py-3 text-right">
        <StatusBadge label={u.status} variant={UPLOAD_VARIANT[u.status] ?? "gray"} />
      </td>
    </tr>
  );
}

export default async function UploadPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, uploads] = await Promise.all([
    getProperty(propertyId, clientId),
    getUploads(clientId, propertyId),
  ]);
  if (!property) notFound();

  const activeUploads   = uploads.filter((u) => u.status !== "Archived");
  const archivedUploads = uploads.filter((u) => u.status === "Archived");

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} clientId={clientId} propertyId={propertyId} />
      <SubPageHeader
        title="Upload Data"
        property={property}
        period={formatPeriod(null)}
        clientId={clientId}
      />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Guidance */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">What to upload</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Share your raw data files with LPP so we can keep your portal current. All uploads are
              reviewed by your LPP team before any numbers appear in the portal.
            </p>
          </div>
          <ul className="space-y-2 text-xs text-gray-600">
            {[
              ["P&L / Income statement", "Monthly or period-end PDF or Excel"],
              ["Labor reports",          "Scheduling system exports — CSV or Excel"],
              ["POS sales data",         "Daily/weekly exports from your POS"],
              ["Guest feedback",         "Review exports, survey results"],
              ["Any other data",         "If you're not sure, upload it and add a note"],
            ].map(([label, desc]) => (
              <li key={label} className="flex gap-3">
                <span className="text-gray-300 mt-0.5">→</span>
                <span><span className="font-medium text-gray-800">{label}</span> — {desc}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Upload form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-5">Upload a file</h2>
          <UploadForm clientId={clientId} propertyId={propertyId} />
        </div>

        {/* Previously uploaded files */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Your uploads</h2>

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
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">No files uploaded yet.</p>
              <p className="text-xs text-gray-300 mt-1">Use the form above to share data with LPP.</p>
            </div>
          )}

          {archivedUploads.length > 0 && (
            <details className="mt-3 bg-white rounded-xl border border-gray-100 overflow-hidden">
              <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-500 flex items-center justify-between select-none hover:bg-gray-50 transition">
                <span>Archived ({archivedUploads.length})</span>
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
        </div>

      </div>
    </div>
  );
}
