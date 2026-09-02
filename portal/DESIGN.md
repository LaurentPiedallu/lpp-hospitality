# Portal design system

Reference for the client portal (`portal/`). Changes that break these rules
should update this file in the same commit.

## Color

Four colors carry the portal. Nothing else is a brand or accent color.

| Name       | Hex       | Use                                                              |
| ---------- | --------- | -------------------------------------------------------------- |
| Dark       | `#12120F` | Text, headers, hero background                                   |
| Cream      | `#F2EDE4` | Page background, light surfaces                                  |
| Gold       | `#B8935A` | Primary accent: progress fill, active state, in-progress status  |
| Action red | `#C0392B` | Urgency only: overdue, blocked, behind schedule                  |

Greys are tints of dark, `rgba(18,18,15,x)`. No other hue is decorative.

### Green is a named exception

`#16A34A` (Tailwind `green-600`, exposed as `status.healthy` in
`tailwind.config.ts`) is allowed in exactly one place: the "complete" status
indicator, meaning the filled dot or check glyph that marks an Initiative or
an Action as done.

Green is not available for:

- decoration or emphasis
- category color coding: Commercial, Finance, Execution, Guest, Labor, or any
  category added later
- charts, badges, links, or any other semantic use

The risk this rule guards against is not the green dot itself. It is green
becoming the precedent that reopens per-category accent colors, which the
Initiatives tab redesign deliberately removed. If color needs to encode a
category, change this file first and expect that change to be challenged.

## Type

- Cormorant Garamond: display text, card titles, the Initiatives headline
- Jost: everything else, including body, nav, captions, labels

## Geometry

Zero border-radius everywhere. The only exception is form inputs, which may
use up to 2px.

## Copy

- No em dashes
- No terminal periods on headlines or section titles
- No parenthetical asides
- Situation language over status jargon: say what is happening rather than
  labels like "Not Started"
