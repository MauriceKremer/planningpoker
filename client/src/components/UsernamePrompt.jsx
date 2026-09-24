import { useState } from 'react';
import { joinSession } from '../utils/api';

const UsernamePrompt = ({ sessionId, onJoinSuccess, sessionTitle }) => {
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
      onJoinSuccess(response.user);
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
    <div className="max-w-md mx-auto card-lg p-5">
      <h2 className="text-xl font-bold text-center text-mocha-800 mb-1">Join Session</h2>
      {sessionTitle && (
        <p className="text-base text-center text-mocha-600 mb-3">"{sessionTitle}"</p>
      )}
      <p className="text-xs text-mocha-400 text-center mb-5">
        Session ID: {sessionId}
      </p>
      
      {error && (
        <div className="mb-3.5 panel-clay text-clay-700">
          {error}
        </div>
      )}
      
      <form onSubmit={handleJoinSession} className="space-y-3.5">
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
            autoFocus
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

      <div className="mt-3.5 text-center">
        <button
          onClick={() => window.history.back()}
          className="text-ember-600 hover:text-ember-700 hover:underline text-sm"
        >
          ← Go Back
        </button>
      </div>
    </div>
  );
};

export default UsernamePrompt;