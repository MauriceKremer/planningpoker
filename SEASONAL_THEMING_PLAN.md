# Seasonal Theming — Implementation Plan

Move periodic (seasonal) styling into a declarative configuration: per-theme
**base color palette**, **backdrop image**, and an **active date window**
(start/end). Themes activate automatically by date — e.g. a Christmas theme
during the weeks before Christmas — and fall back to a default theme outside
every window.

## Current state (what's hardcoded today)

| Concern | Location | Problem |
|---|---|---|
| Color palette (autumn) | `client/tailwind.config.js` | Values baked at build time |
| Backdrop image | `client/src/App.js` inline style | Hardcoded `backdrop_light_autumn.webp` |
| Theme color meta | `client/public/index.html` | Static `#3E2723` |
| OG/Twitter card | `client/public/index.html`, `SEO.js`, images | Manual regenerate + `?v=` bump per season |
| Season knowledge (python) | `generate-social-cards.py` `SEASON_BY_MONTH` | Duplicates the season calendar |
| Date model | — | None |

Key fact that makes this easy: all 13 component files reference **semantic**
color keys (`mocha` = ink, `ember` = primary, `caramel` = secondary,
`cream` = surfaces, `clay` = danger, `sage` = success, `honey` = warning)
and never hardcode hex values. Seasons redefine the *values* under those
keys — zero component changes.

## Design decisions

1. **Fixed semantic color keys, per-theme values.** Component classes
   (`bg-ember-500`, `text-mocha-700`, …) never change; each theme redefines
   what they mean.
2. **Palette via CSS variables.** Tailwind colors become
   `rgb(var(--c-ember-500) / <alpha-value>)` (keeps opacity modifiers like
   `bg-cream-25/95` working). Palettes live as `[data-theme="christmas"] { --c-…: … }`
   blocks. Variables not overridden by a theme inherit from `:root`, so
   partial palettes are allowed.
3. **Single source of truth: `client/src/theme/themes.json`** — read by JS
   (runtime selection) and by `generate-social-cards.py` (social cards), so
   the season calendar exists in exactly one place.
4. **Recurring windows as `MM-DD` strings** (no year) — they recur every
   year automatically. Windows may wrap the year boundary
   (`start > end`, e.g. `"11-24" → "01-06"`).
5. **First match wins.** Array order in the JSON is priority order, so an
   overlapping Christmas window can take over from Autumn in late November.
6. **Fallback theme.** If no window matches, the entry with `"id": "default"`
   applies. Recommend a neutral/classic palette here rather than a seasonal
   one, so January–August gaps never show the wrong season.
7. **Crawlers don't run JavaScript.** `og:image`, `twitter:image` and
   `theme-color` in `index.html` are baked at build time; runtime theme
   switching only affects the SPA. The OG card is therefore still refreshed
   per season at deploy time (regenerate + commit + `?v=` bump) — Phase 3
   automates the bookkeeping.

## Configuration schema (`client/src/theme/themes.json`)

```json
[
  {
    "id": "christmas",
    "label": "Christmas",
    "backdrop": "/images/backdrop_light_christmas.png",
    "start": "11-24",
    "end": "01-06",
    "ogImageVersion": "christmas-2026",
    "themeColor": "#2B1A16"
  },
  { "id": "autumn",   "label": "Autumn",  "backdrop": "/images/backdrop_light_autumn.webp", "start": "09-01", "end": "11-23", "ogImageVersion": "autumn-2026", "themeColor": "#3E2723" },
  { "id": "summer",   "label": "Summer",  "backdrop": "/images/backdrop_light_summer.jpeg", "start": "05-01", "end": "08-31", "ogImageVersion": "summer-2026",  "themeColor": "#1E40AF" },
  { "id": "spring",   "label": "Spring",  "backdrop": "/images/backdrop_light_spring.jpeg", "start": "03-15", "end": "04-30", "ogImageVersion": "spring-2026",  "themeColor": "#3E5F2B" },
  { "id": "easter",   "label": "Easter",  "backdrop": "/images/backdrop_light_easter.png",  "start": "03-15", "end": "04-06", "ogImageVersion": "easter-2026",  "themeColor": "#4E342E" },
  {
    "id": "default",
    "label": "Classic",
    "backdrop": "/images/backdrop_light.png",
    "ogImageVersion": "classic-2026",
    "themeColor": "#1E293B"
  }
]
```

Notes:
- `start`/`end` optional on `default` (never time-boxed).
- Dates above are **placeholders** — the real windows are a product decision
  (esp. Easter, which drifts between March and April; an approximate fixed
  window is fine, or leave it out of rotation and trigger manually).
- Order matters: `christmas` sits above `autumn` so it wins wherever windows
  overlap ("weeks before christmas").

## New/changed files

| Action | Path | Purpose |
|---|---|---|
| new | `client/src/theme/themes.json` | Theme definitions (SSoT, read by JS + Python) |
| new | `client/src/theme/themes.js` | Pure resolver + React hook |
| new | `client/src/theme/themes.css` | `:root` base palette + one `[data-theme]` block per theme |
| new | `client/src/theme/__tests__/themes.test.js` | Resolver tests |
| edit | `client/tailwind.config.js` | Every color → `rgb(var(--c-…) / <alpha-value>)` |
| edit | `client/src/index.css` | Import `themes.css`; `body` color → `rgb(var(--c-mocha-800))` |
| edit | `client/src/App.js` | Use hook: set `data-theme` + backdrop from config |
| edit | `generate-social-cards.py` | Read `themes.json` (replaces `SEASON_BY_MONTH`), `--theme` override |
| edit | `client/public/index.html` | (Phase 3) `theme-color` / og:image version / `data-theme` synced per season by the prebuild script |
| edit | `client/src/components/SEO.js` | og:image version sourced from theme config |

Resolver API (pure & date-injectable → trivially testable):

```js
export function resolveTheme(themes, date = new Date());
// → matching theme object, or the "default" entry

export function useActiveTheme();
// → { theme }; sets data-theme on <html> (so :root vars apply) and is the
//   single place the backdrop style comes from
```

Dev preview override (cheap, very useful for design review):
`?theme=christmas` URL param takes precedence in `useActiveTheme`.

## Phases

### Phase 1 — Config + resolver + tests (no visual change)
- Add `themes.json` (seeded with the six existing backdrops), `themes.js`
  resolver, and unit tests: window match, wrap-around (start > end), array
  priority, fallback, `MM-DD` parsing edge cases (Feb 29 → clamp to Feb 28).

### Phase 2 — CSS-variable plumbing + App wiring (visually identical)
- Convert `tailwind.config.js` colors to `rgb(var(--c-…))`.
- `themes.css`: move today's autumn values into `:root`; add a
  `[data-theme="christmas"]` partial-override block as the worked example.
- `App.js` applies `data-theme` + backdrop from the hook.
- Acceptance: `npm run build` passes; app pixel-identical to today.

### Phase 3 — Meta/build alignment
- `generate-social-cards.py` reads `themes.json` for backdrops + windows
  (keeps Python and JS on one calendar).
- Small node script `client/scripts/sync-season-meta.mjs` (npm `prebuild`): rewrites
  `theme-color`, the og/twitter image `?v=`, and `data-theme` on `<html>` in
  `client/public/index.html` from the active theme. It lives **under `client/`**
  (not the repo root) because the client Docker image builds with context
  `./client` — a repo-root script would be outside the build context and the
  prebuild step would fail inside the image. Regenerating the JPGs stays a
  manual pre-deploy step (`python3 generate-social-cards.py --theme <id>` +
  commit), since the Docker build image has no Python/PIL.
- Checklist doc: at each season change → update window in `themes.json` →
  run generator → commit → deploy.

### Phase 4 — Design work (per season)
- Author real palettes for christmas (and later easter/spring/summer):
  all seven semantic groups recommended for christmas; partial overrides OK
  (e.g. keep `clay`/`sage`/`honey` from base).
- Design the christmas OG card, commit it with its `ogImageVersion`.
- Convert the 2 MB christmas PNG backdrop to WebP (~5× smaller, like autumn).

## Risks / gotchas

- **`<alpha-value>` vars must be RGB triplets** (`"217 107 67"`), not hex,
  or Tailwind opacity modifiers break.
- **The prebuild meta-sync script must live under `client/`** — the client
  Docker image builds with `context: ./client`, so anything outside that
  directory (e.g. a repo-root `scripts/`) never reaches the image and
  `npm run build` would fail on the `prebuild` hook.
- **nginx serves images immutable for 1y** — backdrops are safe (unique
  filename per season); the shared `og-image.jpg` name keeps needing `?v=`.
- **og:image correctness depends on deploy cadence**, not the runtime config
  (crawlers read static HTML). Deploy within the window, or the preview lags.
- No service worker exists, so no SW cache layer to worry about.

## Acceptance criteria

- Editing a date window in `themes.json` is the only change needed to move a
  seasonal boundary.
- No component file changes for any future theme.
- Resolver fully unit-tested (wrap-around, priority, fallback, Feb 29).
- Default theme renders whenever no window matches.
- `?theme=<id>` preview override works in dev.