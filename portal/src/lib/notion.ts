import { Client } from "@notionhq/client";

// Server-side only — never import this from client components
if (typeof window !== "undefined") {
  throw new Error("notion.ts must only be used server-side");
}

export const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Appended to every query — clients never see draft records
export const publishedFilter = {
  property: "Publish Status",
  select: { equals: "Published" },
};

// Wraps any Notion filter with an AND publishedFilter guard.
// Typed as `unknown` to avoid fighting the SDK's deeply nested union types;
// the runtime shape is correct and Notion validates it server-side.
export function withPublished(extraFilter?: unknown): unknown {
  if (!extraFilter) return { and: [publishedFilter] };
  return { and: [publishedFilter, extraFilter] };
}
