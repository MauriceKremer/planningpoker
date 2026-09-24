import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useActiveTheme } from '../theme/themes';

/**
 * public/index.html ships a static set of SEO meta tags as a fallback for
 * crawlers and link-unfurlers that don't execute JavaScript (WhatsApp, Slack,
 * Discord, iMessage preview bots). react-helmet-async only manages the tags it
 * renders itself (marked with data-rh="true"), so those static fallbacks are
 * never removed on its own. Once React has mounted we must delete them, or the
 * DOM ends up with two of every SEO tag (e.g. two meta descriptions), which
 * search engines like Bing flag as an error.
 */
const STATIC_DUPLICATE_SELECTORS = [
  'meta[name="description"]:not([data-rh])',
  'meta[name="title"]:not([data-rh])',
  'meta[name="keywords"]:not([data-rh])',
  'meta[name="robots"]:not([data-rh])',
  'link[rel="canonical"]:not([data-rh])',
  'meta[property="og:url"]:not([data-rh])',
  'meta[property="og:title"]:not([data-rh])',
  'meta[property="og:description"]:not([data-rh])',
  'meta[property="og:image"]:not([data-rh])',
  'meta[property="og:image:width"]:not([data-rh])',
  'meta[property="og:image:height"]:not([data-rh])',
  'meta[property="og:image:alt"]:not([data-rh])',
  'meta[property^="twitter:"]:not([data-rh])',
];

// Static fallbacks only exist once in the initial HTML, so a single cleanup per
// page load is enough (module-level flag, not per-component state).
let staticFallbacksRemoved = false;

const removeStaticFallbacks = () => {
  if (staticFallbacksRemoved) return;
  staticFallbacksRemoved = true;
  STATIC_DUPLICATE_SELECTORS.forEach((selector) => {
    document.head.querySelectorAll(selector).forEach((el) => el.remove());
  });
};

/**
 * SEO component for managing page-specific meta tags
 * Uses react-helmet-async for dynamic meta tag updates.
 * The default og/twitter image version follows the active seasonal theme.
 */
const SEO = ({
  title = 'Free Online Planning Poker – No Signup, No Ads, No Tracking',
  description = 'Free real-time Planning Poker for Agile teams. No signup, no ads, no tracking. Estimate with Fibonacci & T-shirt cards.',
  keywords = 'planning poker, agile estimation, scrum poker, story points, agile tools, planning poker no signup, planning poker no ads, privacy first planning poker',
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
      <meta name="keywords" content={keywords} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
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
