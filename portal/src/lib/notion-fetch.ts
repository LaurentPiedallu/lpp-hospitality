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

// Notion's page/query responses cap a relation property at 25 related items
// and flag the property with has_more: true when there are more. Below the
// cap this returns the array already on the page (no extra request). Once
// has_more is set, the initial 25 are discarded and the full list is
// re-fetched via the "retrieve a page property item" endpoint, which
// paginates independently of — and isn't capped like — the page/query
// response. Confirmed live on Lex Yard's Commercial Initiative (32 linked
// Actions, only 25 present in the query response, has_more: true) — this is
// deliberately generic rather than scoped to that one relation, since any
// relation property can cross 25 as data grows.
export async function relationIds(page: NotionPage, prop: string): Promise<string[]> {
  const relProp = page.properties?.[prop];
  const initial: string[] = (relProp?.relation ?? []).map((r: { id: string }) => r.id);
  if (!relProp?.has_more) return initial;
  return getFullRelationIds(page.id as string, relProp.id as string);
}

// Paginates the "retrieve a page property item" endpoint for one relation
// property, collecting every related page ID regardless of count. Only
// called by relationIds() above once a property reports has_more.
async function getFullRelationIds(pageId: string, propertyId: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;

  do {
    // propertyId comes back from Notion already URL-encoded (e.g. "yn%7B%3F")
    // — re-encoding it with encodeURIComponent double-escapes the `%` and
    // silently matches no property (200 OK, empty result), so it's inserted
    // into the path as-is here.
    const url = new URL(`https://api.notion.com/v1/pages/${pageId}/properties/${propertyId}`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const res = await fetch(url.toString(), { method: "GET", headers: headers() });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion property fetch failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as {
      results: Array<{ relation: { id: string } }>;
      next_cursor: string | null;
      has_more: boolean;
    };
    ids.push(...data.results.map((r) => r.relation.id));
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return ids;
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

// Formula properties nest their resolved value under `.formula`, typed by
// the formula's own result type (number/string/boolean/date). Only the
// number and string shapes are needed so far (Menu Items' computed fields).
export function formulaNumber(page: NotionPage, prop: string): number | null {
  const formula = page.properties?.[prop]?.formula;
  if (!formula || formula.type !== "number") return null;
  return formula.number ?? null;
}

export function formulaString(page: NotionPage, prop: string): string {
  const formula = page.properties?.[prop]?.formula;
  if (!formula || formula.type !== "string") return "";
  return formula.string ?? "";
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

// Retrieve a single page by ID, regardless of which database it's in.
export async function getPage(pageId: string): Promise<NotionPage> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Notion page fetch failed (${res.status}): ${errText}`);
  }

  return res.json() as Promise<NotionPage>;
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
