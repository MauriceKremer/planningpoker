import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Home from './pages/Home';
import Session from './pages/Session';
import JoinSession from './pages/JoinSession';
import About from './pages/About';
import SessionClosedPage from './pages/SessionClosedPage';

function App() {
  return (
    <HelmetProvider>
      <Router>
      <div
        className="min-h-screen"
        style={{
          backgroundImage: "url('/images/backdrop_light_autumn.webp')",
          backgroundSize: '50%',
          backgroundPosition: 'top left',
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'repeat'
        }}
      >
        <header className="bg-mocha-800/90 backdrop-blur-md text-cream-50 py-3 border-b border-ember-700/40 shadow-card">
          <div className="max-w-7xl mx-auto flex justify-between items-center px-4">
            <Link to="/" className="text-xl font-bold tracking-tight hover:text-ember-300 transition-colors">
              Planning Poker
            </Link>
            <div className="flex items-center space-x-4">
              <Link
                to="/about"
                className="text-cream-100 hover:text-ember-300 text-sm font-medium transition-colors"
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
    </Router>
    </HelmetProvider>
  );
}

export default App;