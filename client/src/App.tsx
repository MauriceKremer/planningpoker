import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Home from './pages/Home';
import Session from './pages/Session';
import JoinSession from './pages/JoinSession';
import About from './pages/About';
import SessionClosedPage from './pages/SessionClosedPage';
import GitHubLinks from './components/GitHubLinks';
import ThemeToggle from './components/ThemeToggle';
import { useActiveTheme } from './theme/themes';

/**
 * The router-agnostic application shell: header + routes + active theme.
 *
 * Kept separate from `App` so the build-time pre-render can wrap the same
 * tree in a StaticRouter while the browser uses BrowserRouter. Rendering the
 * shell must therefore stay free of `window`/`document` access at render time.
 */
export function AppShell() {
  const { backdropStyle, mode, setMode } = useActiveTheme();

  return (
    <div
      className="app-shell min-h-screen"
      style={backdropStyle}
    >
      <header className="app-header py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4">
          <Link to="/" className="text-xl font-bold tracking-tight hover:text-ember-300 transition-colors">
            Planning Poker
          </Link>
          <div className="flex items-center space-x-4">
            <ThemeToggle mode={mode} onModeChange={setMode} />
            <GitHubLinks />
            <Link
              to="/about"
              className="header-link text-sm font-medium max-sm:hidden"
            >
              About this app
            </Link>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/join" element={<JoinSession />} />
          <Route path="/session/:sessionId" element={<Session />} />
          <Route path="/session-closed" element={<SessionClosedPage />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <HelmetProvider>
      <Router>
        <AppShell />
      </Router>
    </HelmetProvider>
  );
}

export default App;
