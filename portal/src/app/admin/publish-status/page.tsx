import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getClients, getProperties, getPublishGateStatus } from "@/lib/notion-queries";
import { NOTION_DBS } from "@/lib/notion-ids";
import { formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import type { PublishGateStatus, PublishGateCounts } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";
const RED = "#C0392B";

function notionUrl(databaseId: string): string {
  return `https://www.notion.so/${databaseId.replace(/-/g, "")}`;
}

function GateCell({ counts, databaseIds }: { counts: PublishGateCounts | null; databaseIds: { label: string; id: string }[] }) {
  if (!counts) {
    return <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.3)" }}>—</span>;
  }
  const allPublished = counts.total > 0 && counts.published === counts.total;
  const unpublished = counts.total - counts.published;

  if (allPublished) {
    return (
      <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.6)" }}>
        <span style={{ color: GOLD }}>✓</span> Published
      </span>
    );
  }

  return (
    <div>
      <span style={{ fontFamily: JOST, fontSize: 12, color: RED }}>
        ⚠ {unpublished} unpublished
      </span>
      <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
        {databaseIds.map(({ label, id }) => (
          <a
            key={label}
            href={notionUrl(id)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#B8935A]"
            style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)", textDecoration: "none" }}
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

function MismatchCell({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.6)" }}>
        <span style={{ color: GOLD }}>✓</span> Linked
      </span>
    );
  }
  return (
    <div>
      <span style={{ fontFamily: JOST, fontSize: 12, color: RED }}>
        ⚠ {count} mismatched
      </span>
      <div style={{ marginTop: 4 }}>
        <a
          href={notionUrl(NOTION_DBS.ACTIONS)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#B8935A]"
          style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)", textDecoration: "none" }}
        >
          Actions
        </a>
      </div>
    </div>
  );
}

function BriefCell({ status }: { status: PublishGateStatus["briefStatus"] }) {
  if (status === null) {
    return <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.3)" }}>—</span>;
  }
  if (status === "Published") {
    return (
      <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.6)" }}>
        <span style={{ color: GOLD }}>✓</span> Published
      </span>
    );
  }
  return (
    <div>
      <span style={{ fontFamily: JOST, fontSize: 12, color: RED }}>⚠ {status}</span>
      <div style={{ marginTop: 4 }}>
        <a
          href={notionUrl(NOTION_DBS.BRIEFS)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#B8935A]"
          style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)", textDecoration: "none" }}
        >
          Briefs
        </a>
      </div>
    </div>
  );
}

export default async function PublishStatusPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const clients = await getClients();
  const propertiesByClient = await Promise.all(
    clients.map(async (client) => ({ client, properties: await getProperties(client.id) }))
  );

  const rows: PublishGateStatus[] = await Promise.all(
    propertiesByClient.flatMap(({ client, properties }) =>
      properties.map((property) => getPublishGateStatus(property.id, property.name, client.id))
    )
  );

  return (
    <PageWrapper>
      <NavBar session={session} />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }}>
        <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 10 }}>
          Admin
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(1.8rem, 2.5vw, 2.2rem)", fontWeight: 300, color: "#12120F", marginBottom: 12 }}>
          Publish gate status
        </h1>
        <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.5)", lineHeight: 1.8, maxWidth: 620, marginBottom: 32 }}>
          Per property, the most recent reporting period with any content, whether it&apos;s
          actually ready to show a client, and whether every Action is linked to an Initiative
          that actually belongs to the same property. Reload this page to refresh — nothing
          here is live-polled.
        </p>

        <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, overflow: "hidden" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(18,18,15,0.08)" }}>
                {["Property", "Period", "Intelligence / Opp / Risk", "Actions", "Brief", "Initiative Links"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "12px 20px",
                      fontFamily: JOST,
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "rgba(18,18,15,0.35)",
                      fontWeight: 400,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.propertyId} style={{ borderBottom: "1px solid rgba(18,18,15,0.06)" }}>
                  <td style={{ padding: "16px 20px", fontFamily: SERIF, fontSize: "1.1rem", color: "#12120F" }}>
                    {row.propertyName}
                  </td>
                  <td style={{ padding: "16px 20px", fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.5)" }}>
                    {row.period ? formatPeriod(row.period) : "—"}
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <GateCell
                      counts={row.intelOppRisk}
                      databaseIds={[
                        { label: "Intel", id: NOTION_DBS.INTELLIGENCE },
                        { label: "Opp", id: NOTION_DBS.OPPORTUNITIES },
                        { label: "Risk", id: NOTION_DBS.RISKS },
                      ]}
                    />
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <GateCell counts={row.actions} databaseIds={[{ label: "Actions", id: NOTION_DBS.ACTIONS }]} />
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <BriefCell status={row.briefStatus} />
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <MismatchCell count={row.initiativeMismatchCount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageWrapper>
  );
}
