// No Photo field exists on Properties in Notion, and no property-photography
// convention exists anywhere else in this codebase — this is a new one,
// static files under public/properties/, keyed by property ID. Only
// properties with a real photo appear here; everything else falls back to
// whatever plain treatment the consuming component uses.
export const PROPERTY_PHOTOS: Record<string, string> = {
  "38d20475-2652-8122-8b09-f32d9c2f5f76": "/properties/lex-yard.jpg", // Lex Yard
};

export function propertyPhoto(propertyId: string): string | undefined {
  return PROPERTY_PHOTOS[propertyId];
}
