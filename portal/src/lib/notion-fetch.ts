// Edge-compatible Notion REST wrapper — no SDK, pure fetch.
// Every function here is safe to call from edge API routes.

const NOTION_VERSION = "2022-06-28";

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

// ─── Raw Notion page/property shape helpers ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionPage = Record<string, any>;

export function title(page: NotionPage, prop: string): string {
  return page.properties?.[prop]?.title?.[0]?.plain_text ?? "";
}

export function richText(page: NotionPage, prop: string): string {
  return page.properties?.[prop]?.rich_text?.[0]?.plain_text ?? "";
}

export function select(page: NotionPage, prop: string): string {
  return page.properties?.[prop]?.select?.name ?? "";
}

export function multiSelect(page: NotionPage, prop: string): string[] {
  return (page.properties?.[prop]?.multi_select ?? []).map((s: { name: string }) => s.name);
}

export function num(page: NotionPage, prop: string): number {
  return page.properties?.[prop]?.number ?? 0;
}

export function email(page: NotionPage, prop: string): string {
  return page.properties?.[prop]?.email ?? "";
}

export function url(page: NotionPage, prop: string): string {
  return page.properties?.[prop]?.url ?? "";
}

export function checkbox(page: NotionPage, prop: string): boolean {
  return page.properties?.[prop]?.checkbox ?? false;
}

export function relationId(page: NotionPage, prop: string): string {
  return page.properties?.[prop]?.relation?.[0]?.id ?? "";
}

export function relationIds(page: NotionPage, prop: string): string[] {
  return (page.properties?.[prop]?.relation ?? []).map((r: { id: string }) => r.id);
}

// Rollup properties nest their value under `.rollup`, typed by the rollup's
// own function (number/date/array). We only need the "number" shape here.
export function rollupNumber(page: NotionPage, prop: string): number | null {
  const rollup = page.properties?.[prop]?.rollup;
  if (!rollup || rollup.type !== "number") return null;
  return rollup.number ?? null;
}

export function files(page: NotionPage, prop: string): string {
  const f = page.properties?.[prop]?.files?.[0];
  return f?.file?.url ?? f?.external?.url ?? "";
}

// ─── Query helper ─────────────────────────────────────────────────────────────

interface QueryOptions {
  databaseId: string;
  filter?: unknown;
  sorts?: unknown[];
  pageSize?: number;
}

export async function queryDatabase(opts: QueryOptions): Promise<NotionPage[]> {
  const results: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: opts.pageSize ?? 100,
    };
    if (opts.filter) body.filter = opts.filter;
    if (opts.sorts) body.sorts = opts.sorts;
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(
      `https://api.notion.com/v1/databases/${opts.databaseId}/query`,
      { method: "POST", headers: headers(), body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion query failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { results: NotionPage[]; next_cursor: string | null; has_more: boolean };
    results.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

// Update a single select property on an existing page. Returns the updated
// page as returned by Notion, so the caller can read back the confirmed
// value rather than assuming the write applied as requested.
export async function updateSelectProperty(
  pageId: string,
  property: string,
  value: string
): Promise<NotionPage> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties: { [property]: { select: { name: value } } } }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Notion update failed (${res.status}): ${errText}`);
  }

  return res.json() as Promise<NotionPage>;
}

// Published-only filter — AND-composed with any extra filter
export function publishedAnd(extra?: unknown): unknown {
  const published = { property: "Publish Status", select: { equals: "Published" } };
  if (!extra) return { and: [published] };
  return { and: [published, extra] };
}

// Relation filter — page must have a relation to a specific page ID
export function relationFilter(property: string, pageId: string): unknown {
  return { property, relation: { contains: pageId } };
}

// Date-equals filter — page's date property must exactly match the given ISO date
export function dateEqualsFilter(property: string, isoDate: string): unknown {
  return { property, date: { equals: isoDate } };
}
