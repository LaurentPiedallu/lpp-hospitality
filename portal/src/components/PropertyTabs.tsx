import Link from "next/link";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";

export type PropertyTabKey =
  | "overview"
  | "financial"
  | "commercial"
  | "menu"
  | "initiatives"
  | "intelligence"
  | "upload";

const TABS: { key: PropertyTabKey; label: string; segment: string }[] = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "financial", label: "Financial Review", segment: "/financial" },
  { key: "commercial", label: "Commercial Review", segment: "/commercial" },
  { key: "menu", label: "Menu Engineering", segment: "/menu" },
  { key: "initiatives", label: "Initiatives", segment: "/initiatives" },
  { key: "intelligence", label: "Intelligence", segment: "/intelligence" },
  { key: "upload", label: "Upload", segment: "/upload" },
];

export default function PropertyTabs({
  clientId,
  propertyId,
  active,
}: {
  clientId: string;
  propertyId: string;
  active: PropertyTabKey;
}) {
  return (
    <div
      className="flex overflow-x-auto"
      style={{
        background: "#F2EDE4",
        borderBottom: "1px solid rgba(18,18,15,0.08)",
        padding: "0 60px",
        position: "sticky",
        top: 68,
        zIndex: 50,
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/${clientId}/${propertyId}${tab.segment}`}
            className={isActive ? "" : "hover:text-[rgba(18,18,15,0.7)]"}
            style={{
              fontFamily: JOST,
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: isActive ? "#12120F" : "rgba(18,18,15,0.4)",
              padding: "16px 20px",
              borderBottom: isActive ? "2px solid #B8935A" : "2px solid transparent",
              textDecoration: "none",
              transition: "all 0.25s ease",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
