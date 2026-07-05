import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getClients, getClient, getProperties, getLatestKpiSummary, getActions } from "@/lib/notion-queries";
import { deriveHealth } from "@/lib/health";
import { compact, pct } from "@/lib/format";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import EmptyPropertiesState from "@/components/EmptyPropertiesState";
import type { Client, Property, KpiSummary } from "@/types/portal";

// ─── Data loading ─────────────────────────────────────────────────────────────

interface PropertyCard {
  property: Property;
  kpi: KpiSummary | null;
  openActions: number;
  actionRequired: boolean;
  firstActionDescription: string | null;
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
          const openActionsList = actions.filter((a) => a.status !== "Complete");
          return {
            property,
            kpi,
            openActions: openActionsList.length,
            actionRequired: openActionsList.length > 0,
            firstActionDescription: openActionsList[0]?.notes || openActionsList[0]?.title || null,
            health: deriveHealth(kpi),
          };
        })
      );
      return { client, cards };
    })
  );
}

// ─── Health badge ─────────────────────────────────────────────────────────────

const HEALTH_STYLES = {
  green: { color: "#2A6B3A", border: "rgba(42,107,58,.25)", bg: "rgba(42,107,58,.06)", dot: "#2A6B3A" },
  amber: { color: "#A07C2A", border: "rgba(194,160,100,.35)", bg: "rgba(194,160,100,.08)", dot: "#C2A064" },
  red:   { color: "#C0392B", border: "rgba(192,57,43,.25)",   bg: "rgba(192,57,43,.05)",  dot: "#C0392B" },
};

const HEALTH_LABELS = { green: "On Track", amber: "Monitor", red: "Action Required" };

function HealthBadge({ color }: { color: "green" | "amber" | "red" }) {
  const s = HEALTH_STYLES[color];
  return (
    <div
      className="flex items-center gap-2 shrink-0"
      style={{
        padding: "7px 14px",
        border: `1px solid ${s.border}`,
        background: s.bg,
        fontSize: "11px",
        fontWeight: 800,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: s.color,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0, display: "inline-block" }} />
      {HEALTH_LABELS[color]}
    </div>
  );
}

// ─── KPI cell ─────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  primary,
  sub,
  warn,
  noBorder,
}: {
  label: string;
  primary: string;
  sub?: string | null;
  warn?: boolean;
  noBorder?: boolean;
}) {
  return (
    <div
      style={{
        padding: "0 24px",
        borderRight: noBorder ? "none" : "1px solid rgba(23,20,18,.08)",
        flex: 1,
      }}
    >
      <p style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "#9B9489", marginBottom: 8 }}>
        {label}
      </p>
      <p
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 500,
          fontSize: "38px",
          lineHeight: 1,
          letterSpacing: "-.02em",
          color: warn ? "#A07C2A" : "var(--ink)",
        }}
      >
        {primary}
      </p>
      {sub && (
        <p style={{ fontSize: "12px", color: "#9B9489", marginTop: 5 }}>{sub}</p>
      )}
    </div>
  );
}

// ─── Property card ────────────────────────────────────────────────────────────

function PropertyHealthCard({ card, clientId }: { card: PropertyCard; clientId: string }) {
  const { property, kpi, openActions, actionRequired, firstActionDescription, health } = card;

  // COGS: % primary, $ sub
  const cogsPrimary = kpi?.cogsPct != null ? pct(kpi.cogsPct) : "—";
  const cogsSub     = kpi?.cogsDollars != null ? compact(kpi.cogsDollars) : null;
  const cogsWarn    = kpi?.cogsPct != null && kpi.cogsPct > 35;

  // Payroll: % primary, $ sub
  const laborPrimary = kpi?.laborPct != null ? pct(kpi.laborPct) : "—";
  const laborSub     = kpi?.laborDollars != null ? compact(kpi.laborDollars) : null;
  const laborWarn    = kpi?.laborPct != null && kpi.laborPct > 40;

  // Net Profit: $ primary, % sub
  const netPrimary = kpi?.netProfitDollars != null ? compact(kpi.netProfitDollars) : "—";
  const netSub     = kpi?.netProfitPct != null ? `${kpi.netProfitPct.toFixed(1)}% margin` : null;

  return (
    <Link href={`/${clientId}/${property.id}`} className="block group">
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(23,20,18,.10)",
        }}
        className="hover:shadow-md hover:border-[rgba(194,160,100,0.45)] transition-colors"
      >
        {/* Card header */}
        <div
          className="flex items-start justify-between"
          style={{ padding: "28px 32px 22px", borderBottom: "1px solid rgba(23,20,18,.07)" }}
        >
          <div>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".10em", textTransform: "uppercase", color: "#9B9489", marginBottom: 6 }}>
              {property.location || property.conceptType}
            </p>
            <h3
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 400,
                fontSize: "36px",
                letterSpacing: "-.025em",
                lineHeight: 1,
                color: "var(--ink)",
              }}
            >
              {property.name}
            </h3>
            {property.conceptType && property.location && (
              <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: 6 }}>{property.conceptType}</p>
            )}
          </div>
          <HealthBadge color={health.color} />
        </div>

        {/* KPI strip */}
        {kpi ? (
          <div className="flex" style={{ padding: "26px 8px 26px 32px", borderBottom: "1px solid rgba(23,20,18,.07)" }}>
            <KpiCell
              label="Revenue"
              primary={kpi.revenue != null ? compact(kpi.revenue) : "—"}
              sub={kpi.covers != null ? `${kpi.covers.toLocaleString()} covers` : undefined}
            />
            <KpiCell label="COGS" primary={cogsPrimary} sub={cogsSub} warn={cogsWarn} />
            <KpiCell label="Payroll" primary={laborPrimary} sub={laborSub} warn={laborWarn} />
            <KpiCell label="Net Profit" primary={netPrimary} sub={netSub} noBorder />
          </div>
        ) : (
          <div style={{ padding: "36px 32px", textAlign: "center", background: "rgba(23,20,18,.02)", borderBottom: "1px solid rgba(23,20,18,.07)" }}>
            <p style={{ fontSize: "13px", color: "var(--stone)", fontStyle: "italic" }}>
              No KPI data published for this period. Upload your latest P&amp;L to get started.
            </p>
          </div>
        )}

        {/* Action flag summary */}
        {actionRequired && (
          <div
            style={{
              margin: "14px 32px 0",
              background: "rgba(192,57,43,0.05)",
              border: ".5px solid rgba(192,57,43,0.15)",
              borderRadius: 4,
              padding: "10px 14px",
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#C0392B", flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: "#C0392B" }}>
                Action flagged
              </span>
            </div>
            {firstActionDescription && (
              <p style={{ fontSize: "11px", color: "rgba(18,18,15,0.55)", lineHeight: 1.6, marginTop: 6 }}>
                {firstActionDescription}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 32px", background: "#FAFAF8" }}
        >
          <div className="flex items-center gap-2">
            {openActions > 0 ? (
              <StatusBadge label={`${openActions} action${openActions !== 1 ? "s" : ""} needed`} variant="red" />
            ) : (
              <StatusBadge label="No open actions" variant="green" />
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge
              label={property.dataConfidence}
              variant={property.dataConfidence === "High" ? "green" : property.dataConfidence === "Low" ? "red" : "amber"}
            />
            <span style={{ fontSize: "11px", color: "var(--stone)", fontWeight: 600 }}>View →</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Client section ───────────────────────────────────────────────────────────

function ClientSection({ group }: { group: ClientGroup }) {
  return (
    <section className="mb-12">
      {group.cards.length === 0 ? (
        <EmptyPropertiesState />
      ) : (
        <div className="flex flex-col gap-5">
          {group.cards.map((card) => (
            <PropertyHealthCard key={card.property.id} card={card} clientId={group.client.id} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Mobile summary view (<768px) ──────────────────────────────────────────────

function SummaryTile({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div style={{ background: "#fff", borderRadius: 5, border: ".5px solid rgba(18,18,15,0.08)", padding: 12 }}>
      <p style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: ".15em", color: "rgba(18,18,15,0.35)", marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "18px", color: negative ? "#C0392B" : "#12120F" }}>
        {value}
      </p>
    </div>
  );
}

function MobileSummaryStrip({ cards }: { cards: PropertyCard[] }) {
  const withKpi = cards.filter((c) => c.kpi);
  const totalRevenue = withKpi.reduce((sum, c) => sum + (c.kpi?.revenue ?? 0), 0);
  const marginValues = withKpi.map((c) => c.kpi?.netProfitPct).filter((v): v is number => v != null);
  const avgMargin = marginValues.length ? marginValues.reduce((s, v) => s + v, 0) / marginValues.length : null;
  const openFlags = cards.filter((c) => c.actionRequired).length;
  const totalCovers = withKpi.reduce((sum, c) => sum + (c.kpi?.covers ?? 0), 0);

  return (
    <div className="grid grid-cols-2 gap-2.5" style={{ marginBottom: 24 }}>
      <SummaryTile label="Total Revenue" value={totalRevenue > 0 ? compact(totalRevenue) : "—"} />
      <SummaryTile
        label="Avg Margin"
        value={avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—"}
        negative={avgMargin != null && avgMargin < 0}
      />
      <SummaryTile label="Open Flags" value={String(openFlags)} negative={openFlags > 0} />
      <SummaryTile label="Total Covers" value={totalCovers > 0 ? totalCovers.toLocaleString() : "—"} />
    </div>
  );
}

function MobilePropertyRow({ card, clientId }: { card: PropertyCard; clientId: string }) {
  const { property, kpi, actionRequired } = card;
  const summary = kpi
    ? `${kpi.revenue != null ? compact(kpi.revenue) : "—"} · ${kpi.netProfitPct != null ? `${kpi.netProfitPct.toFixed(1)}%` : "—"}`
    : "No KPI data";

  return (
    <Link
      href={`/${clientId}/${property.id}`}
      className="flex items-center justify-between"
      style={{ background: "#fff", border: "1px solid rgba(23,20,18,.10)", borderRadius: 5, padding: "14px 16px" }}
    >
      <div className="min-w-0">
        <p
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "14px", color: "#12120F" }}
          className="truncate"
        >
          {property.name}
        </p>
        <p style={{ fontSize: "10px", color: "rgba(18,18,15,0.4)", marginTop: 2 }}>{summary}</p>
      </div>
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: actionRequired ? "#C0392B" : "rgba(18,18,15,0.15)",
          flexShrink: 0,
          marginLeft: 12,
        }}
      />
    </Link>
  );
}

function MobileClientSection({ group }: { group: ClientGroup }) {
  return (
    <section className="mb-8">
      {group.cards.length === 0 ? (
        <EmptyPropertiesState />
      ) : (
        <div className="flex flex-col gap-2">
          {group.cards.map((card) => (
            <MobilePropertyRow key={card.property.id} card={card} clientId={group.client.id} />
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
    <div className="min-h-screen" style={{ backgroundColor: "var(--paper)" }}>
      <NavBar session={session} />
      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "48px clamp(16px, 4vw, 40px)" }}>
        <div style={{ marginBottom: "40px" }}>
          <p style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--stone)", marginBottom: 12 }}>
            Client Portal
          </p>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 500,
              fontSize: "42px",
              letterSpacing: "-.025em",
              lineHeight: 1,
              color: "var(--ink)",
              marginBottom: 8,
            }}
          >
            {session.role === "admin" ? "Portfolio Overview" : "Your Properties"}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--muted)" }}>
            {totalProperties} propert{totalProperties !== 1 ? "ies" : "y"} · {groups.map(g => g.client.name).join(", ")}
          </p>
        </div>

        {groups.length === 0 ? (
          <div style={{ border: "1px dashed rgba(23,20,18,.15)", padding: "80px 32px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--stone)" }}>No client data found.</p>
          </div>
        ) : (
          <>
            {/* Mobile summary view (<768px) */}
            <div className="md:hidden">
              <MobileSummaryStrip cards={groups.flatMap((g) => g.cards)} />
              {groups.map((group) => <MobileClientSection key={group.client.id} group={group} />)}
            </div>

            {/* Desktop card layout (768px+) */}
            <div className="hidden md:block">
              {groups.map((group) => <ClientSection key={group.client.id} group={group} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
