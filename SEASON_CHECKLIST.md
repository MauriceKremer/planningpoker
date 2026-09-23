# Season change checklist

The seasonal look is driven entirely by `client/src/theme/themes.json`
(single source of truth) and `client/src/theme/themes.css` (palettes).
At each season boundary:

1. **Update the window** — edit `start`/`end` (`MM-DD`) in
   `client/src/theme/themes.json`. Windows may wrap the year boundary
   (`start > end`, e.g. `"11-24"` → `"01-06"`); array order is priority
   (first match wins).
2. **Author the palette** — add or adjust the `[data-theme="<id>"]` block in
   `client/src/theme/themes.css`. Values are RGB triplets (not hex) so
   Tailwind opacity modifiers keep working. Partial overrides are fine —
   anything not overridden inherits from `:root`.
3. **Regenerate the social cards** — `python3 generate-social-cards.py --theme <id>`
   (picks the theme's backdrop from `themes.json`), then commit the refreshed
   `og-image.jpg` / `twitter-card.jpg`.
4. **Deploy** — `npm run build` runs `client/scripts/sync-season-meta.mjs`,
   which bakes `theme-color`, the og/twitter `?v=` cache-buster, and
   `data-theme` on `<html>` into `client/public/index.html` at image build
   time. No manual index.html edits needed.
5. **Verify** — the app shows the new palette/backdrop; `?theme=<id>` still
   overrides in dev; share-link previews show the new card (platform caches
   may lag until the `?v=` bump propagates).

## Notes

- Deploy within the season window — og:image correctness depends on deploy
  cadence, not the runtime config (crawlers read the static HTML).
- Backdrop files are unique per season (nginx caches images ~1 day); the
  shared `og-image.jpg` filename is why the `?v=` bump exists.
- `generate-social-cards.py` mirrors the JS resolver (`themeWindows.js`) in
  Python. If you change window semantics (wrap-around rules, Feb 29
  handling), update **both** — and note the Python file is currently
  gitignored, so it must be re-added to the repo to be shareable.
- Easter drifts between March and April; its fixed window is approximate.
  Adjust it yearly in `themes.json`, or trigger it manually via
  `--theme easter`.