
const REPO_URL = 'https://github.com/MauriceKremer/planningpoker';

// GitHub Octicons (MIT licensed), inlined so the app keeps its
// no-third-party-requests promise — no icon fonts or external images.
const GitHubIcon = ({ label, href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    title={label}
    aria-label={label}
    className="text-cream-100 hover:text-ember-300 transition-colors"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  </a>
);

const GitHubLinks = () => (
  <div className="flex items-center space-x-3">
    <GitHubIcon
      label="Report an issue on GitHub"
      href={`${REPO_URL}/issues`}
    >
      {/* octicon: issue-opened-16 */}
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </GitHubIcon>
    <GitHubIcon
      label="Join the discussion on GitHub"
      href={`${REPO_URL}/discussions`}
    >
      {/* octicon: comment-discussion-16 */}
      <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z" />
    </GitHubIcon>
  </div>
);

export default GitHubLinks;