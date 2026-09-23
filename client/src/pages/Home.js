import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createSession } from '../utils/api';
import { getRandomTitleSuggestion } from '../utils/titleGenerator';
import { saveUserSession } from '../utils/sessionStorage';
import { getCardSetPreference } from '../utils/cardSetStorage';
import SEO from '../components/SEO';

const Home = () => {
  const navigate = useNavigate();
  const [moderatorName, setModeratorName] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Set a random title suggestion on component mount
    setSessionTitle(getRandomTitleSuggestion());
  }, []);

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Get saved card set preference, if any
      const cardSetPreference = getCardSetPreference();
      const cardSet = cardSetPreference ? cardSetPreference.cardSet : undefined;
      
      const response = await createSession(moderatorName, sessionTitle, cardSet);
      
      // Get the moderator user data (id comes back explicitly from the API)
      const moderatorId = response.userId || response.session.moderatorId;
      const moderatorUser = response.session.users[moderatorId];
      
      if (moderatorUser) {
        // Save user session data to storage instead of URL
        saveUserSession(response.sessionId, {
          userId: moderatorUser.id,
          userName: moderatorUser.name,
          isModerator: true,
          joinedAt: moderatorUser.joinedAt
        });
        
        // Also save to sessionStorage as backup
        
        // Navigate with clean URL (no user parameters)
        navigate(`/session/${response.sessionId}`);
      } else {
        throw new Error('Failed to find moderator user in session');
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateNewTitle = () => {
    setSessionTitle(getRandomTitleSuggestion());
  };

  const handleJoinSession = () => {
    navigate('/join');
  };

  return (
    <>
      <SEO 
        title="Free Online Planning Poker – No Signup, No Ads, No Tracking"
        description="Create or join a Planning Poker session in seconds. No signup, no ads, no tracking. Estimate story points with your Agile team."
        keywords="planning poker, agile estimation, scrum poker, story points, sprint planning, agile tools, free planning poker, planning poker no signup, planning poker no ads, privacy first planning poker, remote estimation"
        url="https://planningpoker.bytecoder.nl/"
      />
      <div className="max-w-md mx-auto card-lg p-5">
      <h1 className="text-xl font-bold text-center text-mocha-800 mb-5">Free Online Planning Poker for Agile Teams</h1>
      
      <div className="space-y-4">
        <form onSubmit={handleCreateSession} className="space-y-3.5">
          <div>
            <label htmlFor="sessionTitle" className="block text-sm font-medium text-mocha-700 mb-1.5">
              Session Title
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                id="sessionTitle"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                className="input-field flex-1"
                placeholder="Enter session title"
                required
              />
              <button
                type="button"
                onClick={generateNewTitle}
                className="btn btn-secondary px-2.5"
                title="Generate random title"
              >
                🎲
              </button>
            </div>
          </div>
          
          <div>
            <label htmlFor="moderatorName" className="block text-sm font-medium text-mocha-700 mb-1.5">
              Your Name (Moderator)
            </label>
            <input
              type="text"
              id="moderatorName"
              value={moderatorName}
              onChange={(e) => setModeratorName(e.target.value)}
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
            {isLoading ? 'Creating...' : 'Create New Session'}
          </button>
        </form>

        <div className="text-center">
          <span className="text-mocha-400 text-sm">or</span>
        </div>

        <button
          onClick={handleJoinSession}
          className="btn btn-secondary w-full py-2 px-4"
        >
          Join Existing Session
        </button>
      </div>
    </div>

      {/* Privacy statement box (same card element as the welcome card) — pills live at the bottom */}
      <section className="max-w-md mx-auto mt-5 card-lg p-5 text-sm text-mocha-600 leading-relaxed">
        <h2 className="text-lg font-semibold text-mocha-800 mb-1.5">Privacy first, no ads — just estimation</h2>
        <p className="mb-2">
          Planning Poker is a free real-time scrum poker tool for Agile teams. Create a session,
          share the link, and estimate story points together — with Fibonacci, T-shirt, or your
          own custom cards. It's a passion project, not an ad machine: no accounts, no tracking,
          and all session data disappears automatically within 24 hours.
        </p>
        <p className="mb-4">
          <Link to="/about" className="text-ember-700 hover:text-ember-800 font-medium underline underline-offset-2">
            Read the user manual &amp; privacy policy →
          </Link>
        </p>
        <div className="flex flex-wrap justify-center gap-2 text-xs border-t border-cream-300 pt-4">
          <span className="card px-2.5 py-1 text-mocha-700">🛡️ Privacy-first</span>
          <span className="card px-2.5 py-1 text-mocha-700">🚫 No signup</span>
          <span className="card px-2.5 py-1 text-mocha-700">🚫 No ads</span>
          <span className="card px-2.5 py-1 text-mocha-700">🚫 No tracking</span>
          <span className="card px-2.5 py-1 text-mocha-700">🗑️ Votes vanish in 24h</span>
        </div>
      </section>
    </>
  );
};

export default Home;