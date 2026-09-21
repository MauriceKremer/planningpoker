import React from 'react';
import { useLocation } from 'react-router-dom';
import SessionClosed from '../components/SessionClosed';
import SEO from '../components/SEO';

const SessionClosedPage = () => {
  const location = useLocation();
  const state = location.state || {};

  return (
    <>
      <SEO 
        title="Session Ended - Planning Poker"
        description="The planning poker session has ended."
        noindex={true}
      />
      <SessionClosed 
        sessionTitle={state.sessionTitle || 'Planning Poker Session'}
        moderatorName={state.moderatorName || null}
        userLeft={state.userLeft || false}
      />
    </>
  );
};

export default SessionClosedPage;