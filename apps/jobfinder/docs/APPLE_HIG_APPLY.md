# Applying Apple HIG to Job Finder

## Authority

| Layer | Source |
|-------|--------|
| Interaction & layout principles | [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) (**authoritative**) |
| Job Finder tokens, routes, product chrome | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) |
| Résumé layers (Fact vault / Generic / Tailored) | [`RESUME_SYSTEM.md`](RESUME_SYSTEM.md) |

GitHub HIG scrapes/skills are optional aids only. If they conflict with Apple’s site or our contracts, **Apple + DESIGN_SYSTEM win**.

## Patterns we use here

### Page chrome (Layout)

- One template: `src/components/layout/PageShell.tsx` + CSS tokens in `src/index.css` (`--jf-shell-max`, `--jf-page-x`, `--jf-page-y`).
- Inbox, Resume, and Settings share the same horizontal inset and title scale; Settings uses `narrow` max-width only.
- Do not add one-off page wrappers (`max-w-[1200px]`, conflicting `py-*`) — extend PageShell instead.
- Official: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout).
- GitHub Apple-inspired kits are optional spacing/type references, not drop-in SPA replacements.

### Master–detail (Mail)

- Desktop: list + detail side by side.
- Narrow: list **or** detail, never both. Back control returns to the list.
- Official: [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables).

### Feedback (not a second commit)

- After a gap answer that writes the Fact vault, show **passive status** near the action (“Added to Fact vault.”).
- Do **not** follow with a mislabeled “Update Generic” CTA — Generic sync is optional on Resume.
- Official: [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback).

### Modality & confirmation

- Confirm destructive or irreversible actions (archive, approve-as-applied).
- Routine skill answers (“Used it”) are the decision — don’t double-prompt for the same layer.
- Official: [Modality](https://developer.apple.com/design/human-interface-guidelines/modality).

### Controls

- Primary actions: solid near-black pills via shadcn `<Button>` (Studio Minimal theme vars).
- Secondary: `variant="secondary"` / `variant="ghost"`. Prefer ≥44×44pt hit targets where practical.
- Official: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons).

### Master–detail (Inbox)

- Use `MasterDetailShell` only — Resizable + ScrollArea. Never hand-roll `100vh` / nested document scroll for list+detail.
- Mobile: list XOR detail. Desktop: both panes; empty detail = “Select a job”.

### Typography & color

- SF / system stack; `#F5F5F7` canvas; `#1D1D1F` ink; `#86868B` secondary.
- Semantic color only for scores / errors — not decorative accent strips.

## Layer language (product law)

| Say | Mean |
|-----|------|
| Fact vault | Confirmed claims (`resume_facts` / master projection) |
| Generic | Printable baseline + layout shell |
| Tailored | Per-job draft from vault + JD |

Never ask the user to “add to Generic” when the action already confirmed a Fact vault claim.

## Agent checklist

Before shipping UI:

1. Read DESIGN_SYSTEM + this file.
2. Wrap new authenticated pages in `PageShell` (same inset as Inbox/Resume).
3. Copy names the correct résumé layer.
4. Prefer inline status over competing secondary cards.
5. Preserve master–detail via `MasterDetailShell` / no-drawer inbox rules; compose shadcn, don’t invent controls.
6. Respect `prefers-reduced-motion`.
