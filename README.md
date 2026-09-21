# Planning Poker Web Application

A real-time Planning Poker application for Agile teams to estimate tasks collaboratively. Built with React, Node.js, Socket.IO, and Docker.

## Features

- 🎯 Create and join estimation sessions with unique session codes
- 🃏 Customizable card sets for story point estimation
- 💾 Card set preference memory - your last used card set is automatically saved
- ⚡ Real-time voting and updates using WebSocket
- 📊 Automatic vote revelation and average calculation
- 🎨 Clean, responsive UI built with Tailwind CSS
- 🐳 Docker-ready deployment setup
- 🔒 **Enhanced Security & Session Management:**
  - Helmet security headers with WebSocket compatibility
  - Rate limiting on API endpoints and Socket.IO events
  - Input validation and sanitization
  - Socket.IO handshake authentication
  - Secure localStorage-based session persistence (no URLs with user data)
  - Connection conflict detection (prevents account sharing)
  - In-memory session store with periodic cleanup of inactive sessions
  - Automatic cleanup of inactive sessions
  - Session restoration across browser refreshes
  - Protection against URL sharing vulnerabilities
  - Trust proxy configuration for reverse proxy deployments

## Technology Stack

**Frontend:**
- React 18
- React Router v6
- Tailwind CSS
- Socket.IO Client

**Backend:**
- Node.js & Express
- Socket.IO
- UUID v4 for user IDs; 8-character alphanumeric session codes (crypto.randomBytes)
- In-memory session store (process-local Map)

**Infrastructure:**
- Docker & Docker Compose
- Nginx (for production frontend)

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (for containerized setup)

### Development Setup

1. **Clone and install dependencies:**
   ```bash
   # Install server dependencies
   cd server
   npm install

   # Install client dependencies
   cd ../client
   npm install
   ```

2. **Setup environment variables:**
   ```bash
   # Copy and edit server environment
   cp server/.env.example server/.env
   
   # Copy and edit client environment
   cp client/.env.example client/.env
   ```

3. **Start the development servers:**
   ```bash
   # Start backend (Terminal 1)
   cd server
   npm run dev

   # Start frontend (Terminal 2)
   cd client
   npm start
   ```

4. **Open your browser:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8081/api

### Docker Setup

1. **Start all services:**
   ```bash
   docker-compose up -d
   ```

2. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8081/api

3. **Stop services:**
   ```bash
   docker-compose down
   ```

## Session Management & Security

### Smart Session Persistence
The application uses a sophisticated session management system that balances security with user experience:

- **localStorage Persistence**: User sessions persist across browser refreshes and tab reopening
- **Clean URLs**: No sensitive user data in URLs - safe to share session links
- **Automatic Restoration**: Users are automatically reconnected to their sessions
- **Fallback Storage**: Uses both localStorage and sessionStorage for reliability

### Connection Security
- **Conflict Detection**: Prevents multiple users from using the same account simultaneously
- **Automatic Disconnection**: Previous connections are automatically terminated when conflicts detected
- **Session Isolation**: Each user connection is tracked independently

### Session Expiration & Cleanup
- **In-memory Sessions**: Sessions live in the server's process-local memory for the lifetime of the Node process
- **Background Cleanup**: Automatic removal of abandoned sessions every 60 seconds
- **Inactivity Detection**: Users inactive for 20+ minutes are marked offline; non-moderators are removed after 25 minutes of inactivity
- **Participant Vote-Out**: Any participant can start a vote to remove another participant; at least 25% of participants (rounded up) must vote yes
- **Session Lifetime**: Sessions with no active users are removed after 24 hours
- **Graceful Degradation**: Sessions handle network interruptions and reconnections

### Privacy & Data Protection
- **No URL Leakage**: User identity never exposed in shareable URLs
- **Temporary Storage**: Session data automatically expires and is cleaned up
- **Private Browsing Support**: Fallback mechanisms for restricted storage environments



### Creating a Session
1. Go to the home page
2. Enter your name as the moderator
3. Click "Create New Session"
4. Share the session URL with your team

### Joining a Session
1. Click "Join Existing Session" on the home page
2. Enter the session ID and your name
3. Start voting on story points

### Voting Process
1. Each participant selects a card value
2. Votes are hidden until everyone has voted
3. Results are automatically revealed with statistics
4. Moderator can reset votes for new rounds

## API Endpoints

### Sessions
- `POST /api/sessions/create` - Create new session
- `GET /api/sessions/:sessionId` - Get session details
- `POST /api/sessions/:sessionId/join` - Join session

All voting and session flow happens over Socket.IO (see events below) — votes are never sent
as plain REST calls, so they stay hidden until the round is revealed.

### WebSocket Events
- `join-session` - Join a session room
- `submit-vote` - Submit a vote
- `reset-votes` - Reset all votes
- `vote-submitted` - Broadcast vote status
- `votes-reset` - Broadcast vote reset
- `user-joined` - Broadcast new user
- `connection-conflict` - Handle duplicate user connections
- `user-disconnected` - Handle user disconnection
- `moderator-changed` - Broadcast moderator transfer
- `user-countdown` - Inactivity countdown notifications
- `participant-auto-removed` - Automatic removal of inactive users
- `session-cleanup` - Session cleanup notifications
- `start-vote-out` - Start a participant vote-out
- `vote-out` - Cast a yes/no vote-out vote
- `vote-out-started` - Notify clients a vote-out has started
- `vote-out-cast` - Broadcast updated vote-out tallies
- `vote-out-ended` - Notify clients the vote-out ended (removed/failed/cancelled)

## Project Structure

```
planning-poker/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/         # Page components
│   │   └── utils/         # API, Socket & Session utilities
│   │       ├── api.js     # API client
│   │       ├── socket.js  # Socket.IO client
│   │       └── sessionStorage.js  # Session persistence
│   ├── public/            # Static assets
│   ├── Dockerfile         # Client Docker config
│   └── nginx.conf         # Nginx configuration
├── server/                # Express backend
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   │   ├── sessionService.js  # In-memory session management
│   │   │   └── socketHandler.js   # WebSocket handling
│   │   ├── socket/        # Socket helpers
│   │   │   ├── cleanupPolicy.js   # Inactivity cleanup logic
│   │   │   ├── connections.js     # Connection + heartbeat tracking
│   │   │   ├── eventPayloads.js # Minimal broadcast deltas
│   │   │   ├── moderator.js       # Moderator transfer logic
│   │   │   ├── rateLimiter.js     # Per-socket rate limiting
│   │   │   └── validation.js      # Input validation
│   │   └── utils/         # Utilities
│   │       └── logger.js  # Logging utility
│   ├── docs/              # Documentation
│   ├── scripts/           # Build and test scripts
│   ├── Dockerfile         # Server Docker config
│   └── Dockerfile.prod    # Production server Docker config
├── docker-compose.yml     # Development multi-service setup
├── docker-compose.prod.yml  # Production multi-service setup
├── .env.example          # Environment template
└── README.md             # This file
```

## Environment Variables

### Server (.env)
```env
NODE_ENV=development
PORT=8081
CLIENT_URL=http://localhost:3000

# Logging (Optional)
DEBUG=true                     # Enable detailed debug logging (default: false in production)
```

### Client (.env)
```env
REACT_APP_API_URL=http://localhost:8081/api
REACT_APP_SOCKET_URL=http://localhost:8081
```

## Deployment

### Production Docker Deployment
1. Update environment variables for production
2. Build and start services:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Manual Deployment
1. Build the React app: `npm run build`
2. Serve static files with Nginx
3. Run the Node.js server with PM2
4. Configure reverse proxy

## Troubleshooting

### Session Issues
- **"Session not found" errors**: The server may have restarted (sessions are in-memory). Clear localStorage for this site and rejoin.
- **Users getting disconnected**: Verify the Socket.IO connection uses WebSocket transport and that the reverse proxy passes the `Upgrade` header.
- **Connection conflicts**: Ensure users aren't sharing URLs with embedded user data
- **Private browsing issues**: Application will fall back to prompting for username

### Performance
- **High memory usage**: The cleanup sweep runs every 60 seconds and removes stale sessions; sessions with no active users older than 24 hours are deleted.
- **Slow responses**: Check server CPU/network and consider reducing the number of open sockets.

### Development
- **Local storage debugging**: Use browser dev tools → Application → Local Storage
- **Session state inspection**: Check `planningpoker_user_sessions` key in localStorage

## Advanced Configuration

### Session Inactivity Thresholds
The cleanup policy is defined in `server/src/socket/cleanupPolicy.js`:

```javascript
const INACTIVITY_GRACE_SECONDS = 1200;  // 20 minutes — start countdown after this
const INACTIVITY_TIMEOUT_SECONDS = 1500; // 25 minutes — remove inactive non-moderators after this total
```

### Vote-Out Threshold
The participant vote-out policy lives in `server/src/socket/voteOut.js` (pure logic,
re-exported by `cleanupPolicy.js` for the inactivity sweep):

```javascript
// server/src/socket/voteOut.js
const VOTE_OUT_THRESHOLD_PERCENT = 25; // at least 25% of participants must vote yes (rounded up)
```

The helper `server/src/socket/voteOut.js::computeVoteOutRequired(count, percent)` calculates the exact required yes votes.

### Cleanup Frequency
Modify how often the system checks for cleanup:

```javascript
// server/src/index.js
const cleanupTimer = setInterval(() => {
  cleanupInactiveSessions(io);
}, 60 * 1000); // 60 seconds
```

Sessions with no active users are deleted after 24 hours.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and add tests
4. Commit changes: `git commit -m 'Add feature'`
5. Push to branch: `git push origin feature-name`
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions, please open a GitHub issue or contact the development team.