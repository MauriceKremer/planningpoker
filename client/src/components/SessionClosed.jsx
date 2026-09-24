import { useNavigate } from 'react-router-dom';
import { clearAllSessionData } from '../utils/sessionStorage';

const SessionClosed = ({ sessionTitle, moderatorName, userLeft = false }) => {
  const navigate = useNavigate();

  const handleReturnHome = () => {
    try {
      // Clear all stored session data to avoid auto-restore
      clearAllSessionData();
    } catch { /* nothing stored — fresh visit */ }
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-6 px-4">
      <div className="max-w-md w-full card-lg p-7 text-center">
          <div className="mb-5">
            <div className="text-5xl mb-3">{userLeft ? '🚪' : '👋'}</div>
            <h1 className="text-xl font-bold text-mocha-800 mb-2">
              {userLeft ? 'You Left the Session' : 'Thanks for Participating!'}
            </h1>
            <p className="text-sm text-mocha-500">
              {userLeft 
                ? `You have left the planning poker session "${sessionTitle}".`
                : `The planning poker session "${sessionTitle}" has been closed by the moderator.`
              }
            </p>
          </div>
          
          <div className="mb-5 panel-honey">
            <p className="text-xs text-honey-800">
              <span className="font-semibold">Session:</span> {sessionTitle}<br />
              {moderatorName && (
                <>
                  <span className="font-semibold">Moderator:</span> {moderatorName}
                </>
              )}
            </p>
          </div>

          <div className="mb-5 bg-cream-100/70 rounded-xl border border-cream-300 hover:bg-cream-100 transition-all duration-300 cursor-pointer group overflow-hidden">
            <div className="p-3.5">
              <div className="max-h-0 group-hover:max-h-32 opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out overflow-hidden">
                <p className="text-xs text-mocha-600 mb-2.5">
                  I'm a developer who loves creating simple, helpful tools to solve everyday problems. 
                  I build apps for myself first and since I don't like paying for stuff or being tracked, 
                  mine are free and privacy-focused. Glad to have you here!
                </p>
              </div>
              <a
                href="https://ko-fi.com/bytecoder"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 bg-honey-300 hover:bg-honey-400 text-mocha-800 px-3.5 py-1.5 rounded-lg font-medium transition-colors text-xs"
              >
                <span>☕</span>
                <span>Support me on Ko-fi</span>
              </a>
            </div>
          </div>
          
          <button
            onClick={handleReturnHome}
            className="btn btn-primary w-full py-2.5 px-5 text-sm"
          >
            Start or Join New Session
          </button>
          
          <p className="mt-3 text-xs text-mocha-400">
            You can now create a new session or join an existing one.
          </p>
      </div>
    </div>
  );
};

export default SessionClosed;