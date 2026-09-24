import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useActiveTheme } from '../theme/themes';

/**
 * The build-time pre-render (scripts/prerender.mjs, M3) bakes route-specific
 * meta into the served HTML for crawlers and link-unfurlers that don't execute
 * JavaScript (GPTBot, WhatsApp, Slack, Discord, iMessage). Every tag it injects
 * carries `data-prerender="true"` (see `renderHead` there). React 19 hoists its
 * own copies on mount (react-helmet-async 3.0 renders them as JSX — it no longer
 * uses the old `data-rh` marker), so the static copies must be removed or the
 * DOM ends up with two of every SEO tag, which search engines like Bing flag as
 * an error. Targeting only the marker leaves React's own tags intact.
 */
const PRERENDERED_SELECTOR = '[data-prerender]';

// Pre-rendered tags only exist once in the initial HTML, so a single cleanup per
// page load is enough (module-level flag, not per-component state).
let staticFallbacksRemoved = false;

const removeStaticFallbacks = () => {
  if (staticFallbacksRemoved) return;
  staticFallbacksRemoved = true;
  document.head.querySelectorAll(PRERENDERED_SELECTOR).forEach((el) => el.remove());
};

/**
 * SEO component for managing page-specific meta tags
 * Uses react-helmet-async for dynamic meta tag updates.
 * The default og/twitter image version follows the active seasonal theme.
 */
const SEO = ({
  title = 'Free Online Planning Poker – No Signup, No Ads, No Tracking',
  description = 'Free real-time Planning Poker for Agile teams. No signup, no ads, no tracking. Estimate with Fibonacci & T-shirt cards.',
  ogImage,
  url = 'https://planningpoker.bytecoder.nl/',
  noindex = false
}) => {
  const { theme } = useActiveTheme();
  const imageVersion = theme?.ogImageVersion || 'classic-2026';
  const socialImage = ogImage || `https://planningpoker.bytecoder.nl/images/og-image.jpg?v=${imageVersion}`;

  useEffect(() => {
    removeStaticFallbacks();
  }, []);

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />
      <link rel="canonical" href={url} />

      {/* Open Graph / Facebook */}
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={socialImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Playful Planning Poker cards over a warm seasonal backdrop" />

      {/* Twitter */}
      <meta property="twitter:url" content={url} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={socialImage} />
      <meta property="twitter:image:alt" content="Playful Planning Poker cards over a warm seasonal backdrop" />
    </Helmet>
  );
};

export default SEO;
