/**
 * Author identity links ("Built by Maurice Kremer").
 *
 * Shown on the About page so visitors — often a scrum master about to point
 * their whole team at a free, anonymous tool — can see the real human behind
 * it. The same identity (name + profile URLs) is declared as the `author`
 * entity with `sameAs` in the JSON-LD of client/index.html; keep the URLs
 * in sync when they change.
 *
 * Icons are inlined SVGs (LinkedIn glyph + GitHub mark), consistent with
 * GitHubLinks.jsx — the app makes no third-party requests.
 */
const AUTHOR = {
  name: 'Maurice Kremer',
  linkedin: 'https://www.linkedin.com/in/mauricekremer/',
  github: 'https://github.com/MauriceKremer',
};

const ProfileLink = ({ href, label, viewBox, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    title={label}
    aria-label={label}
    className="inline-flex items-center gap-1.5 text-mocha-700 hover:text-ember-600 font-medium transition-colors"
  >
    <svg
      width="18"
      height="18"
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
    {label}
  </a>
);

const AuthorLinks = () => (
  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
    <ProfileLink
      href={AUTHOR.linkedin}
      label={`${AUTHOR.name} on LinkedIn`}
      viewBox="0 0 24 24"
    >
      {/* LinkedIn glyph (simple-icons, CC0) */}
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.36 4.267 5.455v6.281zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </ProfileLink>
    <ProfileLink
      href={AUTHOR.github}
      label={`${AUTHOR.name} on GitHub`}
      viewBox="0 0 16 16"
    >
      {/* GitHub mark (octicon mark-github-16, MIT) */}
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.04-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.6-.51 1.16-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45 1.28 1.21 2.2.86-.02.31 0 1.03 0 1.15 0 .21-.15.46-.55.38A8.013 8.013 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </ProfileLink>
  </div>
);

export default AuthorLinks;