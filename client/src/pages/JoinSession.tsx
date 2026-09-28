import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinSession, joinErrorToMessage } from '../utils/api';
import { saveUserSession } from '../utils/sessionStorage';
import SEO from '../components/SEO';

const JoinSession = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoinSession = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await joinSession(sessionId, userName);
      saveUserSession(sessionId, {
        userId: response.userId || response.user.id,
        userName: response.user.name,
        isModerator: response.user.isModerator || false,
        joinedAt: response.user.joinedAt
      });
      navigate(`/session/${sessionId}`);
    } catch (error) {
      console.error('Failed to join session:', error);
      setError(joinErrorToMessage(error));
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <>
      <SEO
        title="Join a Planning Poker Session - Enter a Session Code"
        description="Join an existing Planning Poker session with a session code. No signup, no ads, no tracking — estimate story points with your Agile team in real time."
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