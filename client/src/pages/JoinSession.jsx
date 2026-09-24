import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinSession } from '../utils/api';
import { saveUserSession } from '../utils/sessionStorage';
import SEO from '../components/SEO';

const JoinSession = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoinSession = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await joinSession(sessionId, userName);
      // The server returns the created user explicitly — identity by id,
      // never by name matching (names are display strings).
      const newUser = response.user;

      if (newUser) {
        // Save user session data to storage instead of URL
        saveUserSession(sessionId, {
          userId: response.userId || newUser.id,
          userName: newUser.name,
          isModerator: newUser.isModerator || false,
          joinedAt: newUser.joinedAt
        });

        // Navigate with clean URL (no user parameters)
        navigate(`/session/${sessionId}`);
      } else {
        throw new Error('Failed to find user in session after joining');
      }
    } catch (error) {
      console.error('Failed to join session:', error);

      // Match on the HTTP status (the stable contract), with the parsed
      // body available on error.data.
      if (error.status === 409) {
        setError('This username is already taken. Please choose a different name.');
      } else if (error.status === 404) {
        setError('Session not found. Please check the session ID.');
      } else {
        setError('Failed to join session. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <>
      <SEO
        title="Join a Planning Poker Session - Enter a Session Code"
        description="Join an existing Planning Poker session with a session code. No signup, no ads, no tracking — estimate story points with your Agile team in real time."
        keywords="join planning poker session, planning poker session code, scrum poker join, agile estimation session"
        url="https://planningpoker.bytecoder.nl/join"
      />
    <div className="max-w-md mx-auto card-lg p-5">
      <h1 className="text-xl font-bold text-center text-mocha-800 mb-5">Join a Planning Poker Session</h1>
      
      <form onSubmit={handleJoinSession} className="space-y-3.5">
        {error && (
          <div className="panel-clay text-clay-700">
            {error}
          </div>
        )}
        
        <div>
          <label htmlFor="sessionId" className="block text-sm font-medium text-mocha-700 mb-1.5">
            Session ID
          </label>
          <input
            type="text"
            id="sessionId"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="input-field"
            placeholder="Enter session ID"
            required
          />
        </div>
        
        <div>
          <label htmlFor="userName" className="block text-sm font-medium text-mocha-700 mb-1.5">
            Your Name
          </label>
          <input
            type="text"
            id="userName"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="input-field"
            placeholder="Enter your name"
            required
            autoComplete="off"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary w-full py-2 px-4"
        >
          {isLoading ? 'Joining...' : 'Join Session'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          onClick={() => navigate('/')}
          className="text-ember-600 hover:text-ember-700 hover:underline"
        >
          Back to Home
        </button>
      </div>
    </div>
    </>
  );
};

export default JoinSession;