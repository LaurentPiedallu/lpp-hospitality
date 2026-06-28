import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getClient, getProperties, getLatestKpiSummary } from "@/lib/notion-queries";
import { deriveHealth, healthBgClass, healthColorClass } from "@/lib/health";
import { compact, pct } from "@/lib/format";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import type { HealthColor } from "@/lib/health";

export const runtime = "edge";

function HealthDot({ color }: { color: HealthColor }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${{
      green: "bg-green-500", amber: "bg-amber-500", red: "bg-red-500",
    }[color]}`} />
  );
}

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId } = await params;

  // Non-admin users: enforce they can only view their own client
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [client, properties] = await Promise.all([
    getClient(clientId),
    getProperties(clientId),
  ]);

  if (!client) notFound();

  const cards = await Promise.all(
    properties.map(async (property) => {
      const kpi = await getLatestKpiSummary(property.id);
      const health = deriveHealth(kpi);
      return { property, kpi, health };
    })
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} />

      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
            <Link href="/dashboard" className="hover:text-gray-600 transition">Portfolio</Link>
            <span>/</span>
            <span className="text-gray-600">{client.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{client.name}</h1>
            <StatusBadge
              label={client.status}
              variant={client.status === "Active" ? "green" : "gray"}
            />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {cards.length} propert{cards.length !== 1 ? "ies" : "y"}
          </p>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {cards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-sm text-gray-400">No properties found for this client.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map(({ property, kpi, health }) => (
              <Link
                key={property.id}
                href={`/${clientId}/${property.id}`}
                className="block group"
              >
                <div className="bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-300 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 mb-0.5 truncate">
                        {property.location || property.conceptType}
                      </p>
                      <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 truncate">
                        {property.name}
                      </h3>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ml-2 ${healthBgClass(health.color)}`}>
                      <HealthDot color={health.color} />
                      <span className={healthColorClass(health.color)}>{health.status}</span>
                    </div>
                  </div>

                  {kpi ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Revenue</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {kpi.revenue != null ? compact(kpi.revenue) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Labor %</p>
                        <p className={`text-sm font-semibold ${kpi.laborPct != null && kpi.laborPct > 40 ? "text-amber-600" : "text-gray-900"}`}>
                          {kpi.laborPct != null ? pct(kpi.laborPct) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Net Profit</p>
                        <p className={`text-sm font-semibold ${kpi.netProfitPct != null && kpi.netProfitPct < 8 ? "text-amber-600" : "text-gray-900"}`}>
                          {kpi.netProfitPct != null ? pct(kpi.netProfitPct) : "—"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-3 text-xs text-gray-400 text-center bg-gray-50 rounded-lg">
                      No KPI data published
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-50">
                    <span className="text-xs text-gray-400">{property.status}</span>
                    <StatusBadge
                      label={property.dataConfidence}
                      variant={property.dataConfidence === "High" ? "green" : property.dataConfidence === "Low" ? "red" : "amber"}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
