import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty } from "@/lib/notion-queries";
import { formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import SubPageHeader from "@/components/SubPageHeader";
import UploadForm from "@/components/UploadForm";
import Link from "next/link";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const property = await getProperty(propertyId, clientId);
  if (!property) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} />
      <SubPageHeader
        title="Upload Center"
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

        {/* Link back to documents */}
        <p className="text-xs text-center text-gray-400">
          View all uploaded files in{" "}
          <Link
            href={`/${clientId}/${propertyId}/documents`}
            className="text-blue-500 hover:underline"
          >
            Documents
          </Link>
        </p>

      </div>
    </div>
  );
}
