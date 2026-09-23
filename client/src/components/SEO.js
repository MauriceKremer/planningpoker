import { Helmet } from 'react-helmet-async';
import { useActiveTheme } from '../theme/themes';

/**
 * SEO component for managing page-specific meta tags
 * Uses react-helmet-async for dynamic meta tag updates.
 * The default og/twitter image version follows the active seasonal theme.
 */
const SEO = ({
  title = 'Free Online Planning Poker – No Signup, No Ads, No Tracking',
  description = 'Free real-time Planning Poker for Agile teams. Privacy-first: no signup, no ads, no tracking — votes vanish within 24 hours. Fibonacci & T-shirt cards.',
  keywords = 'planning poker, agile estimation, scrum poker, story points, agile tools, planning poker no signup, planning poker no ads, privacy first planning poker',
  ogImage,
  url = 'https://planningpoker.bytecoder.nl/',
  noindex = false
}) => {
  const { theme } = useActiveTheme();
  const imageVersion = theme?.ogImageVersion || 'classic-2026';
  const socialImage = ogImage || `https://planningpoker.bytecoder.nl/images/og-image.jpg?v=${imageVersion}`;

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
