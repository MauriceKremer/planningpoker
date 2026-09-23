import { useEffect, useMemo, useState } from 'react';
import themeWindows from './themeWindows';
import themes from './themes.json';

const { resolveTheme } = themeWindows;

function getThemeOverride() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('theme');
}

function makeBackdropStyle(theme) {
  if (!theme) return {};
  return {
    backgroundImage: `url('${theme.backdrop}')`,
    // No backgroundSize on purpose: images render at their natural size
    // (CSS default 'auto') and tile via backgroundRepeat below.
    backgroundPosition: 'top left',
    backgroundAttachment: 'fixed',
    backgroundRepeat: 'repeat',
  };
}

/**
 * React hook that returns the currently active theme and the backdrop style
 * derived from it. Sets `data-theme` on <html> so CSS-variable palettes apply.
 * A `?theme=<id>` URL parameter overrides the date-based selection in dev.
 *
 * The theme is resolved synchronously in the state initializer (override
 * included) so the very first render already uses the right palette.
 *
 * @returns {{ theme: object, backdropStyle: object }}
 */
export function useActiveTheme() {
  const [theme] = useState(() => {
    const overrideId = getThemeOverride();
    if (overrideId) {
      const override = themes.find((t) => t.id === overrideId);
      if (override) return override;
    }
    return resolveTheme(themes, new Date());
  });

  useEffect(() => {
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme.id);
    }
  }, [theme]);

  const backdropStyle = useMemo(() => makeBackdropStyle(theme), [theme]);

  return { theme, backdropStyle };
}

export { resolveTheme, themes };