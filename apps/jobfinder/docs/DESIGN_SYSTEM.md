# Job Finder design system — Studio Minimal

Apple-like product UI for a personal jobs workbench. Calm, spacious, near-monochrome. Not a sales CRM.

## Authority

| Layer | Source |
|-------|--------|
| Interaction & layout principles | [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) |
| How we apply HIG here | [`APPLE_HIG_APPLY.md`](APPLE_HIG_APPLY.md) |
| This file | Job Finder visual tokens, routes, chrome |

Conflict rule: Apple HIG principles + these tokens. Product layer copy (Fact vault vs Generic vs Tailored) follows [`RESUME_SYSTEM.md`](RESUME_SYSTEM.md). Unofficial GitHub HIG scrapes never override Apple or these contracts.

## Visual language

- Light-first canvas `#F5F5F7`; white surfaces; ink `#1D1D1F`; secondary `#86868B`
- System SF stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui`
- Primary actions: solid near-black pills via shadcn `<Button>`
- Hairline borders `rgba(0,0,0,0.08)`; almost no shadows
- Large type hierarchy (page titles ~28–40px, tight tracking)
- Soft muted inputs via shadcn `<Input>` / `<Select>`; quiet secondary/ghost variants
- Semantic color only for score / fit / errors
- Refined dark theme (charcoal, not neon)
- Motion: ~160ms ease on selection/hover; respect `prefers-reduced-motion`

**No** blue SaaS accent, purple gradients, decorative glow, dense sidebar chrome, or pill-stat strips.

## Brand

- Product wordmark: **Jobs**
- Sub-brand: Demo Studio (small, secondary)

## Routes

| Route | Purpose |
|-------|---------|
| `/login` | Sign in / sign up / reset |
| `/onboarding` | First résumé |
| `/jobs` | Default authenticated inbox (**Add job**, Favorites filter) |
| `/jobs/:id` | Deep-linkable detail |
| `/jobs/:listingId/resumes/:revisionId` | In-app tailored résumé view (HTML; download optional) |
| `/resume` | Living résumé, history, chat, export |
| `/settings` | Preferences, discovery health |

## Layout

**Page template:** [`PageShell`](../src/components/layout/PageShell.tsx) is the single content chrome for authenticated routes. Do not invent per-page `max-w-*` / `px-*` / `py-*` shells.

| Token / class | Role |
|---------------|------|
| `--jf-shell-max` (1400px) | AppShell header + `PageShell` `wide` / `bleed` |
| `--jf-narrow-max` (42rem) | `PageShell` `narrow` (Settings) |
| `--jf-page-x` / `--jf-page-y` | Shared horizontal inset + title-band vertical rhythm |
| `.jf-shell-rail` | Header inner rail (same x inset as pages) |
| `.jf-page-title` / `.jf-page-sub` | Shared title band |

Modes: `wide` (Inbox, Resume) · `narrow` (Settings) · `bleed` (optional edge-to-edge under the same max width). Inbox uses `flushY` so the master–detail fills below the title band; Resume/Settings keep default vertical padding.

Official layout guidance: [Apple HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout). Optional open-source kits (LiqUIdify, Apple Creative DS, etc.) are **token references only** — not runtime dependencies unless explicitly approved.

**Desktop:** sticky top bar (wordmark + Inbox / Resume / Settings + account) · content stage inside PageShell  

**Inbox (responsive master–detail — Mail / Apple HIG):**  
- Implementation: [`MasterDetailShell`](../src/components/layout/MasterDetailShell.tsx) on shadcn `Resizable` + **native** pane `overflow-y-auto` (prefer over Radix ScrollArea for scroll smoothness).  
- `lg+`: resizable list + detail panes; each pane scrolls independently. Mount **one** breakpoint tree (media query), never desktop+mobile duplicates.  
- `< lg`: list **or** detail, never both. Tap a row → `/jobs/:id` with **Inbox** back control. No drawers or stacked “node” panels.  
- List data stays slim (no JD blobs in the inbox query).  
- **Add job:** Dialog to paste Indeed/any job URL (manual edit always available) → normal Inbox row.  
- **Favorites:** star on list/detail; `?fav=1` filter (orthogonal to status / apply-ready).  
- **Forbidden:** `min-h-[calc(100vh…)]`, nested document scroll, or page-local overflow shells for split views. AppShell stays `h-dvh`; Inbox uses `PageShell` `flushY`.

**Resume:** Fact vault | Generic toggle · vault confirmation inbox · document sheet for Generic · chat/history side panels · contentEditable `.resume-doc` editor for Generic

## Interaction

- Default sort: score desc, then discovered_at desc
- Filters/sort/search in URL
- Server pagination: 50 rows
- Optimistic status with rollback
- Soft archive with confirm
- Employer links clearly external

## Accessibility

WCAG 2.1 AA · keyboard operable · visible focus · status not by color alone · reduced motion · purpose-built empty/loading/error states

## Engineering

React 19, Vite, Tailwind 4, Lucide, TanStack Query, Zod, React Router.

| Layer | Owns |
|-------|------|
| UI kit SoT | shadcn under [`src/components/ui/`](../src/components/ui/) (Radix + Studio Minimal CSS vars in `index.css`) |
| Layout | `PageShell`, Inbox `MasterDetailShell` |
| Typography chrome | `.jf-page-title`, `.jf-page-sub`, `.jf-page-shell*`, `.jf-shell-rail`, `.jf-page-band` |

**New UI** composes shadcn (`<Button>`, `<Input>`, `<Select>`, …). Do **not** invent page-local scroll shells or revive `.jf-btn` / `.jf-input` / `.jf-select` / `.jf-sheet`. Visual authority remains Studio Minimal / Apple HIG theme tokens — not default shadcn zinc. Do **not** import CRM styles or components.
