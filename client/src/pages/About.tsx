import { type PropsWithChildren, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import SEO from '../components/SEO';
import AuthorLinks from '../components/AuthorLinks';

// Single source of truth for the FAQ: the visible list below AND the
// FAQPage JSON-LD schema are rendered from this array, so the structured
// data always matches the on-page content.
const FAQS = [
  {
    q: 'Is Planning Poker really free?',
    a: "Yes — and it will stay that way. It's a passion project: no accounts, no premium tiers, no ads, and no tracking of any kind.",
  },
  {
    q: 'Do I need to sign up?',
    a: 'No. Enter your name, create a session, share the link. That is the whole onboarding process.',
  },
  {
    q: 'What happens to our names and votes?',
    a: "They live in the server's memory only and disappear within 24 hours — or instantly when the moderator closes the session. Nothing is written to disk.",
  },
  {
    q: 'Does it work in incognito or private browsing mode?',
    a: "Yes, with full functionality. The only difference: we can't remember your session between page reloads, so you may need to rejoin via the session link.",
  },
  {
    q: 'Which card sets are supported?',
    a: "Fibonacci, Modified Fibonacci, Mike Cohn's classic set, T-shirt sizes — or your own comma-separated custom values.",
  },
  {
    q: 'Does it work on phones and tablets?',
    a: 'Yes. The cards, results and moderator controls are fully responsive, so the complete flow works on mobile, tablet and desktop.',
  },
  {
    q: 'Do we need to install anything?',
    a: 'No. Planning Poker runs entirely in your browser — the moderator and every participant just open the session link and play. Nothing to install.',
  },
  {
    q: 'How are inactive participants handled?',
    a: 'Automatically: after 20 minutes away a 5-minute warning countdown starts, and they are removed after 25 minutes in total (moderators are exempt). Participants can also start a removal vote (25% of the room), and moderators can remove people directly.',
  },
];

const TAB_ACTIVE = 'border-ember-500 text-ember-700';
const TAB_INACTIVE = 'border-transparent text-mocha-400 hover:text-mocha-600 hover:border-cream-400';

const Section = ({ className = 'mb-6', children }: PropsWithChildren<{ className?: string }>) => (
  <section className={className}>{children}</section>
);
const H3 = ({ children }: PropsWithChildren) => <h3 className="text-xl font-semibold mb-2">{children}</h3>;
const H4 = ({ children }: PropsWithChildren) => <h4 className="text-lg font-medium mt-4 mb-2">{children}</h4>;

const List = ({ ordered, loose, bare, children }: PropsWithChildren<{ ordered?: boolean; loose?: boolean; bare?: boolean }>) => {
  const Tag = ordered ? 'ol' : 'ul';
  const type = ordered ? 'list-decimal' : 'list-disc';
  const className = bare ? 'list-none space-y-1' : `${type} list-inside ml-4 ${loose ? 'space-y-2' : 'space-y-1'}`;
  return <Tag className={className}>{children}</Tag>;
};

const TabButton = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
  >
    {label}
  </button>
);

const BackToHomeButton = () => {
  const navigate = useNavigate();
  return (
    <div className="mt-7 pt-5 border-t border-cream-300">
      <button onClick={() => navigate('/')} className="btn btn-secondary px-4 py-2">
        ← Back to Home
      </button>
    </div>
  );
};

const About = () => {
  const [activeTab, setActiveTab] = useState('manual');

  return (
    <>
      <SEO
        title="About Planning Poker - User Guide & Privacy Policy"
        description="Learn how to use Planning Poker for Agile estimation. Free user manual, privacy policy, and tips for effective remote sprint planning."
        url="https://planningpoker.bytecoder.nl/about"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQS.map(({ q, a }) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        })}</script>
      </Helmet>
      <div className="max-w-4xl mx-auto card-lg">
        <h1 className="text-2xl font-bold text-mocha-800 px-5 pt-5">Planning Poker — User Guide &amp; Privacy Policy</h1>

        <div className="border-b border-cream-300 rounded-t-xl">
          <nav className="flex -mb-px">
            <TabButton label="User Manual" active={activeTab === 'manual'} onClick={() => setActiveTab('manual')} />
            <TabButton label="Privacy Policy" active={activeTab === 'privacy'} onClick={() => setActiveTab('privacy')} />
          </nav>
        </div>

        {/* Both panels are always rendered and toggled with the `hidden`
            attribute rather than mounted/unmounted, so non-JS crawlers and the
            pre-render see the full manual AND privacy policy, not just the
            tab that happens to be active. */}
        <div className="p-5">
          <div className="prose max-w-none" hidden={activeTab !== 'manual'}>
            <h2 className="text-2xl font-bold mb-4">User Manual</h2>

            <Section>
              <H3>Getting Started</H3>
              <p className="mb-3">
                Planning Poker is a collaborative estimation tool for Agile teams. Use it to estimate
                story points, effort, or complexity for your project tasks in real-time with your team.
              </p>
            </Section>

            <Section>
              <H3>Creating a Session</H3>
              <List ordered loose>
                <li>From the home page, enter a session title (or use the random generator 🎲)</li>
                <li>Enter your name as the moderator</li>
                <li>Click "Create New Session"</li>
                <li>Share the session URL or ID with your team members</li>
              </List>
            </Section>

            <Section>
              <H3>Joining a Session</H3>
              <List ordered loose>
                <li>Click "Join Existing Session" from the home page</li>
                <li>Enter the session ID provided by the moderator</li>
                <li>Enter your name</li>
                <li>Click "Join Session"</li>
              </List>
              <p className="mt-3 text-sm text-mocha-500">
                💡 <strong>Tip:</strong> You can also join by clicking a shared session link.
              </p>
            </Section>

            <Section>
              <H3>Voting Process</H3>
              <List ordered loose>
                <li>The moderator starts a voting round by clicking "Start Voting"</li>
                <li>All participants select their estimate from the available cards</li>
                <li>Votes are hidden until everyone has voted</li>
                <li>Results automatically reveal when all votes are in</li>
                <li>The moderator can start a new round by clicking "New Round"</li>
              </List>
            </Section>

            <Section>
              <H3>Moderator Controls</H3>
              <p className="mb-3">As a moderator, you have additional controls:</p>
              <List loose>
                <li><strong>Start Voting:</strong> Begin a new estimation round</li>
                <li><strong>New Round:</strong> Reset votes and start fresh (also shown next to the results)</li>
                <li><strong>⏹ Stop Round:</strong> End an open round early, e.g. to discuss before everyone has voted</li>
                <li><strong>🃏 Cards:</strong> Change the card set (Fibonacci, Modified Fibonacci, Mike Cohn, T-Shirt, or custom comma-separated values)</li>
                <li><strong>👤 Transfer:</strong> Transfer moderator role to another participant</li>
                <li><strong>🔔 Test Sound:</strong> Test notification sounds for all participants</li>
                <li><strong>Remove Participant:</strong> Remove a disruptive or absent participant from the list</li>
                <li><strong>❌ Close Session:</strong> End the session for everyone</li>
              </List>
            </Section>

            <Section>
              <H3>Features</H3>
              <List loose>
                <li><strong>Real-time Updates:</strong> All changes sync instantly via Socket.IO (WebSocket)</li>
                <li><strong>Session Persistence:</strong> Your session continues even if you refresh the page</li>
                <li><strong>Card Set Memory:</strong> Your last used card set is saved in your browser and automatically applied to new sessions</li>
                <li><strong>Audio Notifications:</strong> Get notified when voting starts</li>
                <li><strong>Vote Secrecy:</strong> Individual votes stay hidden until the round is revealed</li>
                <li><strong>Clean URLs:</strong> Share session links safely without exposing user data</li>
                <li><strong>Inactivity Protection:</strong> Participants inactive for 20 minutes get a 5-minute warning countdown and are removed after 25 minutes total (moderators are never auto-removed)</li>
                <li><strong>Participant Vote-Out:</strong> Any participant can start a vote to remove another participant — at least 25% of participants (rounded up) must vote yes within 2 minutes; the initiator can cancel at any time</li>
                <li><strong>Connection Security:</strong> Automatic conflict detection prevents account sharing</li>
                <li><strong>Private Browsing:</strong> Works in incognito/private mode</li>
                <li><strong>Secure Authentication:</strong> Socket.IO handshake validation for all connections</li>
              </List>
            </Section>

            <Section>
              <H3>Tips &amp; Best Practices</H3>
              <List loose>
                <li>Use the card set that best fits your team's estimation style</li>
                <li>Discuss estimates after reveal to reach consensus</li>
                <li>Use the "Stop Round" button if you need to discuss before everyone votes</li>
                <li>Enable audio notifications to stay engaged during remote sessions</li>
                <li>Sessions auto-expire after 24 hours if no active users remain</li>
                <li>Your last chosen card set is remembered for the next session you create</li>
              </List>
            </Section>

            <Section>
              <H3>Troubleshooting</H3>
              <div className="space-y-3">
                <div>
                  <p className="font-medium">Session not found?</p>
                  <p className="text-sm text-mocha-500 ml-4">
                    Sessions expire automatically. The moderator may have closed it, it may have
                    been inactive for too long, or the server may have restarted. Create a new
                    session to continue.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Can't hear notifications?</p>
                  <p className="text-sm text-mocha-500 ml-4">
                    Click anywhere on the page first to enable audio. Some browsers block audio
                    until you interact with the page.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Lost your session after refresh?</p>
                  <p className="text-sm text-mocha-500 ml-4">
                    Your session should persist automatically. If it doesn't, you may be in private
                    browsing mode or have cleared your browser data. Use the session link to rejoin.
                  </p>
                </div>
              </div>
            </Section>

            <BackToHomeButton />
          </div>

          <div className="prose max-w-none" hidden={activeTab !== 'privacy'}>
            <h2 className="text-2xl font-bold mb-4">Privacy Policy</h2>
            <p className="text-sm text-mocha-400 mb-5"><strong>Last Updated: 21 September 2026</strong></p>

            <Section>
              <H3>Introduction</H3>
              <p>
                This Planning Poker application is designed with privacy as a core principle. The policy below
                describes what data is collected, how it is used, and how it is protected.
              </p>
            </Section>

            <Section>
              <H3>Data Collected</H3>

              <H4>Session Data (Temporary)</H4>
              <List>
                <li><strong>Session IDs:</strong> Randomly generated 8-character uppercase hexadecimal codes (A–F, 0–9)</li>
                <li><strong>User Information:</strong> Display names you choose when joining a session (not linked to any personal identity)</li>
                <li><strong>Voting Data:</strong> Story point estimates you submit during sessions</li>
                <li><strong>Activity Timestamps:</strong> Last seen times for session management and cleanup</li>
              </List>

              <H4>Browser Storage</H4>
              <List>
                <li><strong>localStorage:</strong> Session persistence data (session ID, user ID, display name, moderator status) and user preferences (card set choice)</li>
                <li><strong>sessionStorage:</strong> Temporary fallback storage for session continuity</li>
                <li>Preferences are stored only in your browser — never transmitted to the server or other participants</li>
              </List>

              <H4>Technical Data</H4>
              <List>
                <li><strong>WebSocket Connections:</strong> Real-time communication channels (no IP logging)</li>
                <li><strong>Session State:</strong> Current voting status, participant list, and voting results</li>
              </List>
            </Section>

            <Section>
              <H3>Data Not Collected</H3>
              <List bare>
                <li>❌ No email addresses or account credentials</li>
                <li>❌ No personally identifiable information (PII)</li>
                <li>❌ No tracking cookies</li>
                <li>❌ No IP-based analytics, tracking, or geolocation data</li>
                <li>❌ No cross-session user tracking</li>
                <li>❌ No third-party data sharing</li>
                <li>❌ No advertising or marketing data</li>
                <li>❌ No analytics or usage tracking of any kind</li>
              </List>
            </Section>

            <Section>
              <H3>Use of Data</H3>

              <H4>Session Management</H4>
              <List>
                <li>Display your chosen name to other session participants</li>
                <li>Track voting progress and reveal results when complete</li>
                <li>Maintain session continuity during browser refreshes</li>
                <li>Enable moderator controls for session creators</li>
                <li>Remember your card set preference for future sessions (stored locally only)</li>
              </List>

              <H4>Security &amp; Integrity</H4>
              <List>
                <li>Prevent duplicate connections from the same user account</li>
                <li>Detect and remove inactive participants</li>
                <li>Participants can vote to remove disruptive or absent participants (at least 25% of participants, rounded up, must vote yes; expires after 2 minutes)</li>
                <li>Clean up abandoned sessions automatically</li>
              </List>

              <H4>Technical Operations</H4>
              <List>
                <li>Facilitate real-time WebSocket communication</li>
                <li>Synchronize voting state across all participants</li>
                <li>Manage session expiration and cleanup</li>
              </List>
            </Section>

            <Section>
              <H3>Data Storage &amp; Retention</H3>

              <H4>In-Memory Storage</H4>
              <List>
                <li>All session data is stored temporarily in the server's process-local memory</li>
                <li><strong>Active sessions:</strong> Automatically removed when all users disconnect or after 24 hours</li>
                <li><strong>Inactive users:</strong> Non-moderators go offline after 20 minutes of inactivity, get a 5-minute warning countdown, and are removed after 25 minutes in total (moderators are exempt)</li>
                <li><strong>Default sessions:</strong> Removed after 24 hours if no active users remain</li>
                <li>No session data is written to permanent disk storage</li>
                <li>All session data disappears when the server process restarts</li>
              </List>

              <H4>Browser Storage</H4>
              <List>
                <li><strong>localStorage:</strong> Session data persists for up to 24 hours (client-side only); user preferences (like card set selection) persist indefinitely until manually cleared</li>
                <li><strong>sessionStorage:</strong> Cleared when you close the browser tab</li>
                <li>Manual clearing of this data is possible via browser settings at any time</li>
              </List>

              <H4>Automatic Cleanup</H4>
              <List>
                <li>Background cleanup runs every 60 seconds to remove expired sessions</li>
                <li>Users inactive for 25+ minutes (after a 5-minute warning countdown) are automatically removed from sessions</li>
                <li>Participants can vote to remove another participant at any time (2-minute expiry); removed data is deleted immediately</li>
                <li>Session closure by moderator immediately deletes all associated data</li>
              </List>
            </Section>

            <Section>
              <H3>Data Security</H3>

              <H4>Connection Security</H4>
              <List>
                <li><strong>Conflict Detection:</strong> Prevents session hijacking by automatically disconnecting duplicate connections</li>
                <li><strong>Session Isolation:</strong> Each user connection is tracked independently</li>
                <li><strong>Clean URLs:</strong> User identity never exposed in shareable URLs (prevents URL-based account sharing)</li>
              </List>

              <H4>Privacy-by-Design Features</H4>
              <List>
                <li><strong>No Account System:</strong> No passwords, no credentials to compromise</li>
                <li><strong>Ephemeral Data:</strong> All data is temporary and automatically deleted</li>
                <li><strong>Local Storage:</strong> Session persistence uses browser storage, never transmitted to third parties</li>
                <li><strong>No Tracking:</strong> No analytics, cookies, or user behavior monitoring</li>
              </List>

              <H4>Technical Safeguards</H4>
              <List>
                <li>Input validation on all user-provided data</li>
                <li>Socket.IO handshake authentication</li>
                <li>Rate limiting on API endpoints (100 requests per 5 minutes) and per-socket event rate limiting (60 events per minute)</li>
                <li>Request size limits (10KB maximum)</li>
                <li>Session ID validation (8-character uppercase alphanumeric format)</li>
                <li>User ID validation (UUID format)</li>
                <li>Helmet security headers with a strict Content-Security-Policy (applied in all environments; HSTS is enforced in production)</li>
                <li>Trust proxy configuration for SSL termination</li>
                <li>Protection against cross-session contamination</li>
                <li>Access logs stored without IP addresses (privacy-safe log format)</li>
                <li>No analytics, trackers, or cookies</li>
              </List>
            </Section>

            <Section>
              <H3>Your Privacy Rights</H3>

              <H4>Access &amp; Control</H4>
              <List>
                <li><strong>View Your Data:</strong> All data you create (name, votes) is visible to you and other session participants</li>
                <li><strong>Delete Your Data:</strong> Leave a session or wait 25 minutes of inactivity for automatic removal</li>
                <li><strong>Clear Browser Storage:</strong> Delete local session data and preferences via browser settings anytime</li>
                <li><strong>Preference Control:</strong> Card set preferences are stored locally and never shared with other users or sessions</li>
              </List>

              <H4>Data Portability</H4>
              <List>
                <li>No account system = no data to export</li>
                <li>All session data is temporary and session-specific</li>
                <li>Voting results are visible only during the session</li>
              </List>

              <H4>Privacy in Multi-User Sessions</H4>
              <List>
                <li>Your display name and votes are visible to all session participants</li>
                <li>Other participants cannot see your user ID or browser storage</li>
                <li>Moderators cannot access your personal device or browser data</li>
              </List>
            </Section>

            <Section>
              <H3>Data Sharing &amp; Third Parties</H3>
              <p className="mb-3">No sharing, selling, or transmission of data to any third parties:</p>
              <List bare>
                <li>❌ No analytics providers</li>
                <li>❌ No advertising networks</li>
                <li>❌ No data brokers</li>
                <li>❌ No external APIs</li>
                <li>❌ No third‑party data warehousing</li>
              </List>

              <p className="mt-4 mb-2">The only data transmission occurs:</p>
              <List ordered>
                <li><strong>Client ↔ Service:</strong> Your browser communicates with the hosted application</li>
                <li><strong>Service → Participants:</strong> Real-time WebSocket updates</li>
              </List>
            </Section>

            <Section>
              <H3>International Users</H3>
              <p>
                Data is processed in the region where the service is operated. No intentional
                cross-border transfer routines are performed beyond normal internet routing.
              </p>
            </Section>

            <Section>
              <H3>Children's Privacy</H3>
              <p>
                This application is designed for workplace estimation and planning activities.
                No data is knowingly collected from anyone under the age of 13. If used in an
                educational context, appropriate supervision and consent are recommended.
              </p>
            </Section>

            <Section>
              <H3>Changes to This Policy</H3>
              <p>
                This privacy policy may be updated to reflect changes in the application or legal
                requirements. Material changes are communicated through updates to this document
                with a revised "Last Updated" date and release notes in the repository.
              </p>
            </Section>

            <Section>
              <H3>Private Browsing &amp; Storage Restrictions</H3>
              <p>
                The application supports private/incognito browsing modes: if localStorage is
                unavailable, fallback mechanisms use sessionStorage; if both are restricted,
                you'll be prompted to enter your name on each page load. No functionality is
                lost in private browsing mode.
              </p>
            </Section>

            <Section>
              <H3>Data Breach Notification</H3>
              <p>
                In the unlikely event of a security breach: the temporary nature of our data
                (max 24 hours) limits exposure, no passwords or PII exist to be compromised,
                session IDs can be invalidated immediately, and affected sessions would be
                automatically purged.
              </p>
            </Section>

            <Section>
              <H3>Code Transparency</H3>
              <p>
                The source code can be made available for security and privacy inspection upon request.
                A valid support contribution (e.g. subscription, or sponsorship) is expected to sustain
                continued access.
              </p>
            </Section>

            <Section>
              <H3>Compliance</H3>

              <H4>GDPR (European Users)</H4>
              <List>
                <li><strong>Lawful Basis:</strong> Legitimate interest (session functionality)</li>
                <li><strong>Data Minimization:</strong> Only essential data collected</li>
                <li><strong>Storage Limitation:</strong> Automatic deletion after 24 hours max</li>
                <li><strong>Right to Erasure:</strong> Automatic via inactivity or manual session exit</li>
                <li><strong>No Consent Required:</strong> No cookies, tracking, or PII collection</li>
              </List>

              <H4>CCPA (California Users)</H4>
              <List>
                <li><strong>No Sale of Data:</strong> No sale of personal information</li>
                <li><strong>No Third-Party Sharing:</strong> Zero third-party sharing</li>
                <li><strong>Automatic Deletion:</strong> Data deleted within 24 hours</li>
              </List>

              <H4>Other Privacy Laws</H4>
              <p>
                Our minimal, temporary data model (no PII, no tracking) supports broad alignment with
                global privacy principles.
              </p>
            </Section>

            <Section className="mb-6 panel-honey">
              <h3 className="text-base font-semibold mb-2.5 text-mocha-800">Summary: Your Privacy at a Glance</h3>
              <ul className="space-y-1 text-sm">
                <li>✅ <strong>Stored:</strong> Display names, votes, session state (temporary), user preferences (card set — persistent)</li>
                <li>✅ <strong>How long:</strong> Session data up to 24 hours maximum, then auto-deleted; preferences persist until manually cleared</li>
                <li>✅ <strong>Who sees it:</strong> Only participants in your session (preferences are private to your browser)</li>
                <li>✅ <strong>Third parties:</strong> Zero. None. Never.</li>
                <li>✅ <strong>Your control:</strong> Leave anytime, data auto-deleted after 25 min inactivity (with a 5-minute warning countdown), clear preferences anytime via browser settings</li>
                <li>✅ <strong>Security:</strong> Conflict detection, session isolation, no URL leakage</li>
                <li>✅ <strong>Transparency:</strong> Code view available (with contribution)</li>
              </ul>
              <p className="mt-4 text-sm font-medium">
                <strong>Bottom Line:</strong> Only short-lived session data required for collaborative
                estimation is retained and removed automatically. User preferences (like card set
                choice) are stored locally in your browser for convenience and never shared.
              </p>
            </Section>

            <BackToHomeButton />
          </div>

          {/* FAQ — always visible at the bottom of the About page, regardless of tab */}
          <Section className="mt-2 mb-6">
            <h2 className="text-xl font-semibold mb-2">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {FAQS.map(({ q, a }) => (
                <div key={q}>
                  <p className="font-medium">{q}</p>
                  <p className="text-sm text-mocha-500 ml-4">{a}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Author — visible on both tabs, so the pre-rendered page (and any
              visitor deciding whether to trust this free, anonymous tool) always
              sees the real person who built it. */}
          <Section className="mt-2 mb-6 panel-honey">
            <h2 className="text-base font-semibold mb-2.5 text-mocha-800">Built by Maurice Kremer</h2>
            <p className="text-sm text-mocha-600 mb-3">
              Planning Poker is an independent passion project, built and maintained in spare
              time. Questions, feedback or ideas for the tool are always welcome.
            </p>
            <AuthorLinks />
          </Section>
        </div>
      </div>
    </>
  );
};

export default About;