import Link from "next/link";
import type { Property } from "@/types/portal";
import type { DataConfidence } from "@/types/portal";
import RequestAnalysisButton from "@/components/RequestAnalysisButton";

const CONFIDENCE_BADGE: Record<DataConfidence, string> = {
  High:                "bg-green-50 text-green-700 ring-1 ring-green-200",
  Medium:              "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Low:                 "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Requires Validation": "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export default function SubPageHeader({
  title,
  property,
  period,
  clientId,
  intelligenceCategory,
}: {
  title: string;
  property: Property;
  period: string;
  clientId: string;
  intelligenceCategory?: string;
}) {
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
          <Link href="/dashboard" className="hover:text-gray-600 transition">Portfolio</Link>
          <span>/</span>
          <Link href={`/${clientId}/${property.id}`} className="hover:text-gray-600 transition truncate max-w-[120px] sm:max-w-none">{property.name}</Link>
          <span>/</span>
          <span className="text-gray-600">{title}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{property.name} · {period}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${CONFIDENCE_BADGE[property.dataConfidence]}`}>
              Data: {property.dataConfidence}
            </span>
            {intelligenceCategory && (
              <RequestAnalysisButton
                clientId={clientId}
                propertyId={property.id}
                category={intelligenceCategory}
                label="Refresh analysis"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
