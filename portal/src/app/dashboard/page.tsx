import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getClients, getClient, getProperties, getLatestKpiSummary, getActions,
  hasUnpublishedFinancialData, getPublishedBriefs, getOpportunities, getIntelligence,
} from "@/lib/notion-queries";
import { deriveHealth } from "@/lib/health";
import { compact } from "@/lib/format";
import { selectTopPriorities } from "@/lib/priorities";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import { propertyPhoto } from "@/lib/property-photos";
import type { Client, Property, KpiSummary, Opportunity, Intelligence } from "@/types/portal";
import type { HealthColor } from "@/lib/health";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const INK = "#12120F";
const GOLD = "#B8935A";
const RED = "#C0392B";
const INK_MUTED = "rgba(18,18,15,0.55)";
const INK_QUIET = "rgba(18,18,15,0.35)";
const INK_BORDER = "rgba(18,18,15,0.08)";

// ─── Data loading ─────────────────────────────────────────────────────────────

interface PropertyCard {
  property: Property;
  kpi: KpiSummary | null;
  openActions: number;
  health: ReturnType<typeof deriveHealth>;
  unpublishedFinancialData: boolean;
  // Same three "at a glance" signals as the property Overview page's
  // scorecard/Top 3 Priorities, at portfolio level: annual $ across the
  // current period's Opportunities, and the #1-ranked priority's title
  // (selectTopPriorities — shared with Overview, see src/lib/priorities.ts).
  annualOpportunity: number;
  topPriorityTitle: string | null;
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
          const [kpi, actions, briefs, intelligence] = await Promise.all([
            getLatestKpiSummary(property.id),
            getActions(property.id),
            getPublishedBriefs(property.id, client.id),
            getIntelligence(property.id),
          ]);

          // Same convention as the property Overview page: Opportunities are
          // scoped to the current period (the most recent Published Brief's
          // Reporting Period), never aggregated across every period ever
          // generated for this property.
          const currentPeriod = briefs[0]?.reportingPeriodStart ?? null;
          const opportunities: Opportunity[] = currentPeriod
            ? await getOpportunities(property.id, currentPeriod)
            : [];
          const annualOpportunity = opportunities.reduce((s, o) => s + o.estimatedAnnualImpact, 0);
          const topPriorities = selectTopPriorities(opportunities, intelligence as Intelligence[]);

          // Admin-only signal: financial numbers are all missing even though
          // a summary exists — check whether that's because real data is
          // sitting unpublished in Notion, rather than never having arrived.
          const financialFieldsAllNull =
            kpi != null &&
            kpi.revenue == null && kpi.cogsPct == null &&
            kpi.laborPct == null && kpi.netProfitDollars == null;
          const unpublishedFinancialData =
            session.role === "admin" && financialFieldsAllNull
              ? await hasUnpublishedFinancialData(property.id)
              : false;

          return {
            property,
            kpi,
            // clientVisible + not Complete — same definition the property
            // Overview page's own "Open Actions" count already uses. This
            // used to only gate whether the Action Required badge showed,
            // never a displayed number, so the missing clientVisible filter
            // was invisible; now that it's a real KPI cell, a mismatched
            // count against the same property's Overview page would be a
            // real, visible bug, not a stylistic difference.
            openActions: actions.filter((a) => a.clientVisible && a.status !== "Complete").length,
            health: deriveHealth(kpi),
            unpublishedFinancialData,
            annualOpportunity,
            topPriorityTitle: topPriorities[0]?.title ?? null,
          };
        })
      );

      return { client, cards };
    })
  );
}

// ─── Health badge — Good / Medium / Attention per design tokens ──────────────

const HEALTH_BADGE: Record<HealthColor, React.CSSProperties> = {
  green: { background: "rgba(18,18,15,0.04)", color: "rgba(18,18,15,0.5)", border: "1px solid rgba(18,18,15,0.1)" },
  amber: { background: "rgba(184,147,90,0.1)", color: "rgba(184,147,90,0.8)", border: "1px solid rgba(184,147,90,0.2)" },
  red:   { background: "rgba(192,57,43,0.06)", color: RED, border: "1px solid rgba(192,57,43,0.15)" },
};

function HealthBadge({ color, label }: { color: HealthColor; label: string }) {
  return (
    <span
      style={{
        fontFamily: JOST,
        fontSize: 10,
        fontWeight: 400,
        padding: "3px 10px",
        borderRadius: 0,
        ...HEALTH_BADGE[color],
      }}
    >
      {label}
    </span>
  );
}

function ActionRequiredBadge() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: JOST,
        fontSize: 9,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: RED,
        border: "1px solid rgba(192,57,43,0.2)",
        padding: "5px 12px",
        background: "rgba(192,57,43,0.04)",
        borderRadius: 0,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: RED, flexShrink: 0 }} />
      Action Required
    </div>
  );
}

// ─── KPI cell ─────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, negative }: { label: string; value: string; sub?: string; negative?: boolean }) {
  return (
    <div style={{ paddingRight: 20 }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_QUIET, marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontFamily: SERIF, fontSize: "1.9rem", fontWeight: 400, color: negative ? RED : INK, lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 10, color: INK_QUIET, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// ─── Property card ────────────────────────────────────────────────────────────

function PropertyOverviewCard({ card, clientId }: { card: PropertyCard; clientId: string }) {
  const { property, openActions, health, unpublishedFinancialData, annualOpportunity, topPriorityTitle } = card;
  const photoUrl = propertyPhoto(property.id);

  return (
    <Link
      href={`/${clientId}/${property.id}`}
      className="group block border border-[rgba(18,18,15,0.08)] hover:border-[rgba(184,147,90,0.25)]"
      style={{
        background: "#FFFFFF",
        borderRadius: 0,
        padding: "28px 32px",
        marginBottom: 12,
        transition: "border-color 0.25s ease",
        textDecoration: "none",
      }}
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" style={{ marginBottom: 20 }}>
        <div className="flex items-start" style={{ gap: 16 }}>
          {photoUrl && (
            <div
              style={{
                width: 88,
                height: 64,
                flexShrink: 0,
                backgroundImage: `url(${photoUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                border: "1px solid rgba(18,18,15,0.08)",
              }}
            />
          )}
          <div>
            <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: INK_QUIET, marginBottom: 4 }}>
              {property.location || property.conceptType}
            </p>
            <h3 style={{ fontFamily: SERIF, fontSize: "1.8rem", fontWeight: 400, color: INK, lineHeight: 1.1 }}>
              {property.name}
            </h3>
            {property.conceptType && (
              <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 3 }}>{property.conceptType}</p>
            )}
          </div>
        </div>
        {openActions > 0 && <ActionRequiredBadge />}
      </div>

      {unpublishedFinancialData && (
        <p style={{ fontSize: 11, color: RED, marginBottom: 16, fontFamily: JOST }}>
          Admin only: financial data exists in Notion but isn&apos;t published yet.
        </p>
      )}

      {/* KPI row — same three signals as the property Overview page's
          At-a-glance scorecard/Top 3 Priorities, at portfolio level. None
          of the three require a KpiSummary to exist (unlike the old
          Revenue/COGS/Labor/Profit row), so this always renders — each
          cell falls back to its own "—" independently rather than gating
          the whole row on one field. */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3"
        style={{ borderTop: `1px solid rgba(18,18,15,0.06)`, paddingTop: 20, marginBottom: 20, rowGap: 20, columnGap: 20 }}
      >
        <Kpi
          label="Financial Opportunity"
          value={annualOpportunity > 0 ? compact(annualOpportunity) : "—"}
        />
        <Kpi label="Open Actions" value={String(openActions)} />
        <div>
          <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_QUIET, marginBottom: 6 }}>
            Top Priority
          </p>
          <p style={{ fontFamily: SERIF, fontSize: "1.15rem", fontWeight: 400, color: INK, lineHeight: 1.35 }}>
            {topPriorityTitle ?? "—"}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between"
        style={{ borderTop: `1px solid rgba(18,18,15,0.06)`, paddingTop: 14 }}
      >
        <HealthBadge color={health.color} label={health.status} />
        <span
          className="group-hover:text-[#12120F]"
          style={{
            fontFamily: JOST,
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(18,18,15,0.4)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "color 0.25s ease",
          }}
        >
          View →
        </span>
      </div>
    </Link>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 40px" }}>
      <p style={{ fontFamily: SERIF, fontSize: "1.4rem", fontWeight: 300, color: INK_QUIET, marginBottom: 10 }}>
        {title}
      </p>
      <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.35)", lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
        {body}
      </p>
    </div>
  );
}

// ─── Client section (only shown as its own group when there's more than one) ─

function ClientSection({ group }: { group: ClientGroup }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: SERIF, fontSize: "1.3rem", fontWeight: 400, color: INK }}>{group.client.name}</h2>
        <span
          style={{
            fontFamily: JOST,
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "3px 8px",
            color: group.client.status === "Active" ? "rgba(184,147,90,0.8)" : INK_QUIET,
            background: group.client.status === "Active" ? "rgba(184,147,90,0.1)" : "rgba(18,18,15,0.04)",
            border: `1px solid ${group.client.status === "Active" ? "rgba(184,147,90,0.2)" : "rgba(18,18,15,0.1)"}`,
          }}
        >
          {group.client.status}
        </span>
      </div>
      {group.cards.length === 0 ? (
        <EmptyState title="No properties yet" body="Properties will appear here once added for this client." />
      ) : (
        group.cards.map((card) => (
          <PropertyOverviewCard key={card.property.id} card={card} clientId={group.client.id} />
        ))
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const groups = await loadDashboard(session);
  const totalProperties = groups.reduce((sum, g) => sum + g.cards.length, 0);

  const subtitle =
    groups.length <= 1
      ? `${totalProperties} propert${totalProperties === 1 ? "y" : "ies"}${groups[0] ? ` · ${groups[0].client.name}` : ""}`
      : `${totalProperties} propert${totalProperties === 1 ? "y" : "ies"} · ${groups.length} clients`;

  return (
    <PageWrapper>
      <NavBar session={session} />

      <div style={{ padding: "52px 60px 40px" }}>
        <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: GOLD, marginBottom: 10 }}>
          Client Portal
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(2rem, 3vw, 2.8rem)", fontWeight: 300, color: INK, marginBottom: 6 }}>
          Portfolio Overview
        </h1>
        <p style={{ fontFamily: JOST, fontSize: 13, color: INK_MUTED, fontWeight: 300 }}>{subtitle}</p>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 60px 80px" }}>
        {groups.length === 0 ? (
          <EmptyState title="No properties yet" body="Your portfolio will appear here once properties are added to your account." />
        ) : groups.length === 1 ? (
          groups[0].cards.length === 0 ? (
            <EmptyState title="No properties yet" body="Your portfolio will appear here once properties are added to your account." />
          ) : (
            groups[0].cards.map((card) => (
              <PropertyOverviewCard key={card.property.id} card={card} clientId={groups[0].client.id} />
            ))
          )
        ) : (
          groups.map((group) => <ClientSection key={group.client.id} group={group} />)
        )}
      </div>
    </PageWrapper>
  );
}
