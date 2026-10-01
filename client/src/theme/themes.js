import { useEffect, useMemo, useState } from 'react';
import { resolveTheme } from './themeWindows';
import themes from './themes.json';
import { getThemeModePreference, saveThemeModePreference } from '../utils/themePreference';

function getThemeOverride() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('theme');
}

// A missing backdrop means "no illustration" (Clean Mode) — the style object
// stays empty instead of emitting url(undefined).
function makeBackdropStyle(theme) {
  if (!theme || !theme.backdrop) return {};
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
 * React hook that returns the active theme mode, theme and backdrop style.
 * The theme id is mirrored to `data-theme` on <html> so CSS-variable palettes
 * apply. Selection precedence: a `?theme=<id>` URL parameter (dev preview),
 * then the Clean Mode preference ('clean'/'clean-dark' entries in themes.json),
 * then the date-based seasonal window.
 *
 * The theme is resolved synchronously in the state initializer so the very
 * first render already uses the right palette. All `window` access is guarded,
 * so the build-time pre-render can render the same hook safely on the server.
 *
 * @returns {{ theme: object, backdropStyle: object,
 *             mode: import('../utils/themePreference').ThemeMode,
 *             setMode: (mode: import('../utils/themePreference').ThemeMode) => void }}
 */
export function useActiveTheme() {
  const [mode, setModeState] = useState(getThemeModePreference);

  const theme = useMemo(() => {
    const overrideId = getThemeOverride();
    if (overrideId) {
      const override = themes.find((t) => t.id === overrideId);
      if (override) return override;
    }
    const modeTheme = themes.find((t) => t.id === mode);
    return modeTheme || resolveTheme(themes, new Date());
  }, [mode]);

  useEffect(() => {
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme.id);
    }
  }, [theme]);

  const backdropStyle = useMemo(() => makeBackdropStyle(theme), [theme]);

  const setMode = (nextMode) => {
    setModeState(nextMode);
    saveThemeModePreference(nextMode);
  };

  return { theme, backdropStyle, mode, setMode };
}

export { resolveTheme, themes };