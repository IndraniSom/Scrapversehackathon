# UI Quality Checklist — Production Polish

> Branch `bidradar-full-platform` · Tasks 31-32 · Editorial restraint, procurement precision.

## Responsive — 320/768/1024/1440

- [x] 320px: no page overflow (`scrollWidth <= clientWidth`), 44px targets remain tappable, drawer overlays, filter sheet uses `<details>`
- [x] 768px: `.discovery-layout` collapses to single column, sidebar hidden, drawer not rendered on desktop (`@media (min-width:768) display:none`)
- [x] 1024px: `.proposal-workspace-layout` 280px+1fr, rail wraps; `discovery-layout` 240px+1fr
- [x] 1440px: shell widens to 1280px max, not giant metrics, cards respect `var(--measure)` 68ch
- [x] Table wrapper `overflow-x:auto` scrolls internally; page never scrolls horizontally at any breakpoint
- [x] Long titles (68ch) wrap with `text-wrap: pretty` and `overflow-wrap:anywhere` for hashes
- [x] Tested via `frontend/e2e/responsive.spec.ts` at 320/768/1024/1440 across `/`, `/opportunities`, `/reviews`, `/companies`

## Keyboard

- [x] Skip link `href="#main-content"` is first focusable, off-screen until `:focus`, 44px target
- [x] Tab order: skip → brand → `SideNavigation` → main; Shift+Tab returns
- [x] Drawer: Menu button `aria-expanded`, `aria-controls="mobile-drawer"`, `role=dialog` `aria-modal=true`, Esc closes and restores focus
- [x] Filters: native `<input>`/`<select>` with `<label>` association, Tab reachable, announcements via live region on changes
- [x] Bulk table: `Select all` checkbox Space toggles, row checkboxes `aria-label="Select {title}"`, bulk buttons disabled until selection
- [x] Saved-search dialog: Esc closes, focus returns to trigger
- [x] Clause review: two-pane keyboard reachable, `Reject` validates reason, `Confirm` announces `role=status`
- [x] No focus trap on product routes; verified 8-tab cycle on `/`, `/opportunities`, `/companies`
- [x] Spec: `frontend/e2e/keyboard.spec.ts`

## WCAG 2.2 AA

- [x] Landmarks: `<header class="site-header">`, `<aside class="shell-sidebar">`, `<nav aria-label>`, `<main id="main-content">`, `<footer>`
- [x] Headings: every product page has `h1` (Newsreader), hierarchy `h1→h2→h3`, no skipped levels
- [x] Contrast: `--text` oklch(0.22) on `--surface` oklch(0.998), `--muted` 0.48 on paper, `--action` 0.38 on white all ≥4.5:1
- [x] Focus visible: `:focus-visible { outline: 3px solid var(--focus) }` on `a, button, summary, input, select, textarea`
- [x] Target size: every interactive `min-height:44px` (buttons, links, tabs, checkboxes via style width/height 18px + label hit target)
- [x] Labels: every field has `<label>` or `aria-label`, errors use `role=alert`, status uses `role=status` + `aria-live=polite`
- [x] Tables: `<caption class="sr-only">`, `<th scope="col">`, row checkboxes with labels, not `role=grid`
- [x] Status badges: icon `aria-hidden` + text label, color never sole meaning
- [x] Reduced motion: `prefers-reduced-motion` sets `--duration-fast/normal` to 0.01ms, disables scroll-behavior
- [x] Spec: `frontend/e2e/accessibility.spec.ts` (static token checks + browser landmark/focus/target checks)

## Performance — Lighthouse Production Budgets

| Metric | Budget | Profile | Enforcement |
|--------|--------|---------|-------------|
| LCP | ≤2.5s | Moto G4 + 4G, 1024px | `pnpm build` + Lighthouse CI thresholds |
| CLS | ≤0.10 | all viewports | layout stability via fixed skeleton shapes |
| INP | ≤200ms | keyboard + click | no long tasks, 150-250ms transitions max |

- [x] Skeletons are destination-shaped (`skeleton-line`, `skeleton-block`, `skeleton-row`) not spinners; `role=status` `aria-live=polite`
- [x] No decorative page-load animation; motion limited to 150-250ms state transitions, respects `prefers-reduced-motion`
- [x] Fonts: `Newsreader` + `IBM Plex Sans/Mono` via `display=swap`, no layout shift
- [x] Images: no large hero images; data URLs only for subtle grain (`opacity:0.03`)
- [x] Build passes: `pnpm build` compiled successfully, routes `ƒ` dynamic / `○` static as expected

## Design System — Frontend-Design Discipline

- [x] Tokens: single green accent `oklch(0.38 0.11 142)`, paper surfaces `--surface` `--surface-subtle` `--surface-strong`, stone borders `--border`
- [x] Shape: `--radius` 10px, `--radius-sm` 8px, no excessive rounding
- [x] Space: 4/8 rhythm `--space-1`..`--space-10`, `var(--measure)` 68ch for prose
- [x] Typography: Newsreader display 700, IBM Plex Sans UI, IBM Plex Mono for hashes/ids, no Inter/Arial
- [x] Components: `.btn-primary` green, `.btn-ghost` stone, `.card/.panel`, `.filter-rail`, `.drawer-overlay/.drawer-panel`, `.proposal-workspace-layout` editorial three-column
- [x] No gradients, no glassmorphism, no giant hero metrics, no identical card grids, no repeated uppercase eyebrows, no fake metrics

## AI-Slop Review

- [x] Copy is concrete procurement language: Opportunity, Source run, Official document, Requirement, Evidence, Assessment, Corrigendum, Compliance matrix, Submission package
- [x] Banned phrases absent: “AI-powered insights”, “unlock value”, “supercharge”, “seamless intelligence”
- [x] Every AI block cites `documentId/page` or `evidenceId`; ungrounded marked `AUTHOR_INPUT_REQUIRED`
- [x] Empty states teach next action: “Add a company to evaluate” not “Nothing here yet”

## Evidence

- `frontend/e2e/accessibility.spec.ts`
- `frontend/e2e/responsive.spec.ts`
- `frontend/e2e/keyboard.spec.ts`
- `frontend/e2e/full-bid-lifecycle.spec.ts`
- `tools/seed_production_demo.py` + `tools/demo_seed.json`
- `tools/smoke_platform.py`
- `docs/demo-script.md`
