import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getClients, getClient, getProperties, getLatestKpiSummary, getActions } from "@/lib/notion-queries";
import { deriveHealth, healthColorClass, healthBgClass } from "@/lib/health";
import { compact, pct } from "@/lib/format";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import type { Client, Property, KpiSummary } from "@/types/portal";
import type { HealthColor } from "@/lib/health";

// ─── Data loading ─────────────────────────────────────────────────────────────

interface PropertyCard {
  property: Property;
  kpi: KpiSummary | null;
  openActions: number;
  health: ReturnType<typeof deriveHealth>;
}

interface ClientGroup {
  client: Client;
  cards: PropertyCard[];
}

async function loadDashboard(session: Awaited<ReturnType<typeof getSession>>): Promise<ClientGroup[]> {
  if (!session) return [];

  const clients = session.role === "admin"
    ? await getClients()
    : session.clientId
      ? [await getClient(session.clientId)].filter(Boolean) as Client[]
      : [];

  return Promise.all(
    clients.map(async (client) => {
      const properties = await getProperties(client.id);

      const cards: PropertyCard[] = await Promise.all(
        properties.map(async (property) => {
          const [kpi, actions] = await Promise.all([
            getLatestKpiSummary(property.id),
            getActions(property.id),
          ]);
          return {
            property,
            kpi,
            openActions: actions.filter((a) => a.status !== "Complete").length,
            health: deriveHealth(kpi),
          };
        })
      );

      return { client, cards };
    })
  );
}

// ─── Components ───────────────────────────────────────────────────────────────

function HealthDot({ color }: { color: HealthColor }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${{
      green: "bg-green-500",
      amber: "bg-amber-500",
      red:   "bg-red-500",
    }[color]}`} />
  );
}

function PropertyHealthCard({ card, clientId }: { card: PropertyCard; clientId: string }) {
  const { property, kpi, openActions, health } = card;

  return (
    <Link href={`/${clientId}/${property.id}`} className="block group">
      <div className="bg-white rounded-2xl border border-gray-100 p-14 hover:border-gray-300 hover:shadow-md transition-all">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="text-lg text-gray-400 mb-1">{property.location || property.conceptType}</p>
            <h3 className="text-4xl font-semibold text-gray-900 group-hover:text-gray-700">{property.name}</h3>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-base font-medium ${healthBgClass(health.color)}`}>
            <HealthDot color={health.color} />
            <span className={healthColorClass(health.color)}>{health.status}</span>
          </div>
        </div>

        {/* KPI grid */}
        {kpi ? (
          <div className="grid grid-cols-2 gap-8 mb-10">
            <div>
              <p className="text-base text-gray-400 mb-1">Total Revenue</p>
              <p className="text-3xl font-semibold text-gray-900">
                {kpi.revenue != null ? compact(kpi.revenue) : "—"}
              </p>
            </div>
            <div>
              <p className="text-base text-gray-400 mb-1">COGS %</p>
              <p className={`text-3xl font-semibold ${kpi.cogsPct != null && kpi.cogsPct > 32 ? "text-amber-600" : "text-gray-900"}`}>
                {kpi.cogsPct != null ? pct(kpi.cogsPct) : "—"}
              </p>
            </div>
            <div>
              <p className="text-base text-gray-400 mb-1">Labor %</p>
              <p className={`text-3xl font-semibold ${kpi.laborPct != null && kpi.laborPct > 40 ? "text-amber-600" : "text-gray-900"}`}>
                {kpi.laborPct != null ? pct(kpi.laborPct) : "—"}
              </p>
            </div>
            <div>
              <p className="text-base text-gray-400 mb-1">Total Profit</p>
              <div className="flex items-center gap-2">
                <p className={`text-3xl font-semibold ${kpi.netProfitDollars != null && kpi.netProfitDollars < 0 ? "text-amber-600" : "text-gray-900"}`}>
                  {kpi.netProfitDollars != null ? compact(kpi.netProfitDollars) : "—"}
                </p>
                {kpi.financialSeverity && (
                  <span className={`text-lg ${
                    kpi.financialSeverity === "Healthy" ? "text-green-500" :
                    kpi.financialSeverity === "Critical" || kpi.financialSeverity === "Action Required" ? "text-red-500" :
                    "text-amber-500"
                  }`}>
                    {kpi.financialSeverity === "Healthy" ? "↑" :
                     kpi.financialSeverity === "Critical" || kpi.financialSeverity === "Action Required" ? "↓" : "→"}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-10 py-8 text-base text-gray-400 text-center bg-gray-50 rounded-lg">
            No KPI data published
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-50">
          {openActions > 0 ? (
            <StatusBadge label={`${openActions} action${openActions !== 1 ? "s" : ""} needed`} variant="red" />
          ) : (
            <StatusBadge label="No open actions" variant="green" />
          )}
          <StatusBadge
            label={property.dataConfidence}
            variant={property.dataConfidence === "High" ? "green" : property.dataConfidence === "Low" ? "red" : "amber"}
          />
        </div>
      </div>
    </Link>
  );
}

function ClientSection({ group }: { group: ClientGroup }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{group.client.name}</h2>
        <StatusBadge
          label={group.client.status}
          variant={group.client.status === "Active" ? "green" : "gray"}
        />
      </div>
      {group.cards.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">No properties found for this client.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {group.cards.map((card) => (
            <PropertyHealthCard key={card.property.id} card={card} clientId={group.client.id} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const groups = await loadDashboard(session);
  const totalProperties = groups.reduce((n, g) => n + g.cards.length, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            {session.role === "admin" ? "Portfolio Overview" : "Your Properties"}
          </h1>
          <p className="text-sm text-gray-500">
            {totalProperties} propert{totalProperties !== 1 ? "ies" : "y"} across {groups.length} client{groups.length !== 1 ? "s" : ""}
          </p>
        </div>
        {groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-sm text-gray-400">No client data found.</p>
          </div>
        ) : (
          groups.map((group) => <ClientSection key={group.client.id} group={group} />)
        )}
      </main>
    </div>
  );
}
