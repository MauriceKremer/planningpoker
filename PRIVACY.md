# Privacy Policy

**Last Updated: September 21, 2026**

## Introduction

This Planning Poker application is designed with privacy as a core principle. The policy below describes what data is collected, how it is used, and how it is protected.

## Data Collected

### Session Data (Temporary)
- **Session IDs**: Randomly generated 8-character uppercase alphanumeric codes (hexadecimal, A–F and 0–9)
- **User Information**: Display names you choose when joining a session (not linked to any personal identity)
- **Voting Data**: Story point estimates you submit during sessions
- **Activity Timestamps**: Last seen times for session management and cleanup

### Browser Storage
- **localStorage**: Session persistence data (session ID, user ID, display name, moderator status) and user preferences (card set preference)
- **sessionStorage**: Temporary fallback storage for session continuity

### User Preferences (Persistent)
- **Card Set Preference**: Your last selected card set (Fibonacci, T-Shirt, custom values, etc.) is saved locally to provide a better user experience
- **Storage**: Stored only in your browser's localStorage, never transmitted to servers or other users
- **Purpose**: Automatically applies your preferred card set when creating new sessions
- **Control**: Can be cleared anytime through browser settings or by selecting a different card set

### Technical Data
- **WebSocket Connections**: Real-time communication channels (no IP logging)
- **Session State**: Current voting status, participant list, and voting results

## Data Not Collected

- ❌ No email addresses or account credentials
- ❌ No personally identifiable information (PII)
- ❌ No tracking cookies or analytics
- ❌ No IP address logging or geolocation data
- ❌ No cross-session user tracking
- ❌ No third-party data sharing
- ❌ No advertising or marketing data

## Use of Data

### Session Management
- Display your chosen name to other session participants
- Track voting progress and reveal results when complete
- Maintain session continuity during browser refreshes
- Enable moderator controls for session creators
- Remember your card set preference for future sessions (stored locally only)

### Security & Integrity
- Prevent duplicate connections from the same user account
- Detect and remove inactive participants
- Participants may vote to remove another participant (at least 25% of participants, rounded up, must vote yes; expires after 2 minutes); moderators may also remove participants directly
- Clean up abandoned sessions automatically

### Technical Operations
- Facilitate real-time WebSocket communication
- Synchronize voting state across all participants
- Manage session expiration and cleanup

## Data Storage & Retention

### In-Memory Storage
- All session data is stored temporarily in the server's process-local memory
- **Active sessions**: Automatically removed when all users disconnect or after 24 hours
- **Inactive users**: Non-moderators go offline after 20 minutes of inactivity, get a 5-minute warning countdown, and are removed after 25 minutes in total (moderators are exempt)
- **Default sessions**: Removed after 24 hours if no active users remain
- No session data is written to permanent disk storage
- All session data disappears when the server process restarts

### Browser Storage
- **localStorage**: Session data persists for up to 24 hours (client-side only); user preferences (like card set selection) persist indefinitely until manually cleared
- **sessionStorage**: Cleared when you close the browser tab
- Manual clearing of this data is possible via browser settings at any time.

### Automatic Cleanup
- Background cleanup runs every 60 seconds to remove expired sessions
- Users inactive for 25+ minutes (after a 5-minute warning countdown) are automatically removed from sessions
- Session closure by moderator immediately deletes all associated data
- Participants may vote to remove another participant (2-minute expiry); removed data is deleted immediately

## Data Security

### Connection Security
- **Conflict Detection**: Prevents session hijacking by automatically disconnecting duplicate connections
- **Session Isolation**: Each user connection is tracked independently
- **Clean URLs**: User identity never exposed in shareable URLs (prevents URL-based account sharing)

### Privacy-by-Design Features
- **No Account System**: No passwords, no credentials to compromise
- **Ephemeral Data**: All data is temporary and automatically deleted
- **Local Storage**: Session persistence uses browser storage, never transmitted to third parties
- **No Tracking**: No analytics, cookies, or user behavior monitoring

### Technical Safeguards
- Input validation on all user-provided data
- WebSocket event authentication
- Rate limiting on API endpoints (100 requests per 5 minutes) and per-socket event rate limiting (60 events per minute)
- Request size limits (10KB maximum)
- Session ID validation (8-character uppercase alphanumeric format)
- User ID validation (UUID format)
- Helmet security headers for production
- Trust proxy configuration for SSL termination
- Protection against cross-session contamination
- Access logs stored without IP addresses (privacy-safe log format)
- No analytics, trackers, or cookies

## Your Privacy Rights

### Access & Control
- **View Your Data**: All data you create (name, votes) is visible to you and other session participants
- **Delete Your Data**: Leave a session or wait 25 minutes of inactivity for automatic removal
- **Clear Browser Storage**: Delete local session data and preferences via browser settings anytime
- **Preference Control**: Card set preferences are stored locally and never shared with other users or sessions

### Data Portability
- No account system = no data to export
- All session data is temporary and session-specific
- Voting results are visible only during the session

### Privacy in Multi-User Sessions
- Your display name and votes are visible to all session participants
- Other participants cannot see your user ID or browser storage
- Moderators cannot access your personal device or browser data

## Data Sharing & Third Parties

No sharing, selling, or transmission of data to any third parties:
- ❌ No analytics providers
- ❌ No advertising networks  
- ❌ No data brokers
- ❌ No external APIs
- ❌ No third‑party data warehousing

The only data transmission occurs:
1. **Client ↔ Service**: Your browser communicates with the hosted application
2. **Service → Participants**: Real-time WebSocket updates

## International Users

Data is processed in the region where the service is operated. No intentional cross-border transfer routines are performed beyond normal internet routing.

## Children's Privacy

This application is designed for workplace estimation and planning activities. No data is knowingly collected from anyone under the age of 13. If used in an educational context, appropriate supervision and consent are recommended.

## Changes to This Policy

This privacy policy may be updated to reflect changes in the application or legal requirements. Material changes are communicated through:
- Updates to this document with revised "Last Updated" date
- Release notes in the GitHub repository

## Private Browsing & Storage Restrictions

The application supports private/incognito browsing modes:
- If localStorage is unavailable, fallback mechanisms use sessionStorage
- If both are restricted, you'll be prompted to enter your name on each page load
- No functionality is lost in private browsing mode

## Data Breach Notification

In the unlikely event of a security breach:
- The temporary nature of our data (max 24 hours) limits exposure
- No passwords or PII exist to be compromised
- Session IDs can be invalidated immediately
- Affected sessions would be automatically purged

## Code Transparency

The source code can be made available for security and privacy inspection upon request. A valid support contribution (e.g. subscription, or sponsorship) is expected to sustain continued access. 

## Compliance

### GDPR (European Users)
- **Lawful Basis**: Legitimate interest (session functionality)
- **Data Minimization**: Only essential data collected
- **Storage Limitation**: Automatic deletion after 24 hours max
- **Right to Erasure**: Automatic via inactivity or manual session exit
- **No Consent Required**: No cookies, tracking, or PII collection

### CCPA (California Users)
- **No Sale of Data**: No sale of personal information
- **No Third-Party Sharing**: Zero third-party sharing
- **Automatic Deletion**: Data deleted within 24 hours

### Other Privacy Laws
Our minimal, temporary data model (no PII, no tracking) supports broad alignment with global privacy principles.

---

## Summary: Your Privacy at a Glance

✅ **Stored**: Display names, votes, session state (temporary), user preferences (card set - persistent)  
✅ **How long**: Session data up to 24 hours max, then auto-deleted; preferences persist until manually cleared  
✅ **Who sees it**: Only participants in your session (preferences are private to your browser)  
✅ **Third parties**: Zero. None. Never.  
✅ **Your control**: Leave anytime, data auto-deleted after 25 min inactivity (with a 5-minute warning countdown), clear preferences anytime via browser settings  
✅ **Security**: Conflict detection, session isolation, no URL leakage  
✅ **Transparency**: Code view available (with contribution)  

**Bottom Line**: Only short‑lived session data required for collaborative estimation is retained and removed automatically. User preferences (like card set choice) are stored locally in your browser for convenience and never shared.
