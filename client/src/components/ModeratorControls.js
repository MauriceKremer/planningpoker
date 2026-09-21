import React, { useState } from 'react';
import { saveCardSetPreference } from '../utils/cardSetStorage';

const PREDEFINED_CARD_SETS = {
  fibonacci: { name: 'Fibonacci', values: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89'] },
  modifiedFibonacci: { name: 'Modified Fibonacci', values: ['0', '0.5', '1', '2', '3', '5', '8', '13', '20', '40', '100'] },
  mikeCohn: { name: 'Mike Cohn', values: ['0', '1', '2', '3', '5', '8', '13', '20', '40', '100'] },
  tshirt: { name: 'T-Shirt', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] }
};

const ModeratorControls = ({ session, onStartVoting, onResetVotes, onStopRound, onTestSound, onUpdateCardSet, onTransferModerator, onCloseSession }) => {
  const [showCardSetModal, setShowCardSetModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedCardSet, setSelectedCardSet] = useState('fibonacci');
  const [customCardSet, setCustomCardSet] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState('');
  
  if (!session) return null;
  
  const currentCardSet = session.cardSet || PREDEFINED_CARD_SETS.fibonacci.values;

  const handleCardSetUpdate = () => {
    let newCardSet;
    let cardSetType;
    
    if (isCustom) {
      // Parse custom card set
      const customValues = customCardSet
        .split(',')
        .map(val => val.trim())
        .filter(val => val.length > 0);
      
      if (customValues.length === 0) {
        alert('Please enter at least one card value');
        return;
      }
      
      newCardSet = customValues;
      cardSetType = 'custom';
    } else {
      newCardSet = PREDEFINED_CARD_SETS[selectedCardSet].values;
      cardSetType = selectedCardSet;
    }
    
    // Save to localStorage for future sessions
    saveCardSetPreference(newCardSet, cardSetType);
    
    if (onUpdateCardSet) {
      onUpdateCardSet(newCardSet);
    }
    
    setShowCardSetModal(false);
  };
  
  const handleTransferModerator = () => {
    if (!selectedParticipant) {
      alert('Please select a participant to transfer moderator role to');
      return;
    }
    
    const targetUser = session.users[selectedParticipant];
    const confirmMessage = `Are you sure you want to transfer moderator role to ${targetUser.name}? This action cannot be undone.`;
    
    if (window.confirm(confirmMessage)) {
      if (onTransferModerator) {
        onTransferModerator(selectedParticipant);
      }
      setShowTransferModal(false);
      setSelectedParticipant('');
    }
  };
  
  const handleCloseSession = () => {
    const confirmMessage = 'Are you sure you want to close this session? This will end the session for all participants and cannot be undone.';
    
    if (window.confirm(confirmMessage)) {
      if (onCloseSession) {
        // Call the close handler - this will emit the socket event
        // The server will broadcast session-closed event back to all clients
        // including the moderator, which will show the SessionClosed component
        onCloseSession();
      }
    }
  };
  
  // Get non-moderator participants for transfer selection
  const availableParticipants = Object.values(session.users || {})
    .filter(user => !user.isModerator && user.isOnline);

  return (
    <>
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="font-semibold text-mocha-800 text-sm">Moderator Controls</h4>
            <p className="hidden sm:block text-xs text-mocha-500 mt-0.5">
              Card Set: <span className="text-mocha-600 font-medium">{currentCardSet.join(', ')}</span>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-1 mt-2 sm:mt-0 sm:justify-end">
            <button
              onClick={() => setShowTransferModal(true)}
              className="btn btn-secondary text-xs px-2 py-1"
              title="Transfer moderator role to another participant"
              disabled={availableParticipants.length === 0}
            >
              👤 Transfer
            </button>
            
            <button
              onClick={() => setShowCardSetModal(true)}
              className="btn btn-secondary text-xs px-2 py-1"
              title="Configure card values for estimation"
            >
              🃏 Cards
            </button>
            
            {onTestSound && (
              <button
                onClick={onTestSound}
                className="btn btn-quiet text-xs px-2 py-1 text-honey-700 hover:bg-honey-50 hover:border-honey-300"
                title="Test sound notification for all participants"
              >
                🔔
              </button>
            )}
            
            <button
              onClick={handleCloseSession}
              className="btn btn-danger text-xs px-2 py-1"
              title="Close this session for all participants"
              aria-label="Close session"
            >
              ❌ Close session
            </button>
          </div>
          
          <p className="sm:hidden text-xs text-mocha-500 mt-2 text-center">
            Card Set: <span className="text-mocha-600 font-medium">{currentCardSet.join(', ')}</span>
          </p>
        </div>
      </div>

      {/* Card Set Configuration Modal */}
      {showCardSetModal && (
        <div className="fixed inset-0 bg-mocha-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card-lg p-5 max-w-md w-full mx-4">
            <h3 className="text-base font-semibold text-mocha-800 mb-4">Configure Card Set</h3>
            
            <div className="space-y-3">
              {/* Predefined Sets */}
              <div>
                <label className="flex items-center space-x-2 text-sm text-mocha-700">
                  <input
                    type="radio"
                    className="accent-ember-600"
                    checked={!isCustom}
                    onChange={() => setIsCustom(false)}
                  />
                  <span className="font-medium">Predefined Sets</span>
                </label>
                
                {!isCustom && (
                  <div className="ml-6 mt-2 space-y-1.5">
                    {Object.entries(PREDEFINED_CARD_SETS).map(([key, set]) => (
                      <label key={key} className="flex items-center space-x-2 text-sm text-mocha-700">
                        <input
                          type="radio"
                          name="cardSet"
                          value={key}
                          className="accent-ember-600"
                          checked={selectedCardSet === key}
                          onChange={(e) => setSelectedCardSet(e.target.value)}
                        />
                        <span className="font-medium">{set.name}</span>
                        <span className="text-xs text-mocha-400">({set.values.join(', ')})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Custom Set */}
              <div>
                <label className="flex items-center space-x-2 text-sm text-mocha-700">
                  <input
                    type="radio"
                    className="accent-ember-600"
                    checked={isCustom}
                    onChange={() => setIsCustom(true)}
                  />
                  <span className="font-medium">Custom Set</span>
                </label>
                
                {isCustom && (
                  <div className="ml-6 mt-2">
                    <input
                      type="text"
                      placeholder="Enter values separated by commas (e.g., 1, 2, 4, 8)"
                      value={customCardSet}
                      onChange={(e) => setCustomCardSet(e.target.value)}
                      className="input-field text-sm"
                    />
                    <p className="text-xs text-mocha-400 mt-1">
                      Separate values with commas. Examples: 1, 2, 3, 5, 8 or Small, Medium, Large
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex space-x-2.5 mt-5">
              <button
                onClick={handleCardSetUpdate}
                className="btn btn-primary flex-1 py-2 px-4"
              >
                Update Card Set
              </button>
              <button
                onClick={() => setShowCardSetModal(false)}
                className="btn btn-quiet flex-1 py-2 px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Moderator Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-mocha-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card-lg p-5 max-w-md w-full mx-4">
            <h3 className="text-base font-semibold text-mocha-800 mb-4">Transfer Moderator Role</h3>
            
            <div className="space-y-3">
              <p className="text-sm text-mocha-500">
                Select a participant to transfer your moderator role to. This action cannot be undone.
              </p>
              
              {availableParticipants.length === 0 ? (
                <p className="text-sm text-clay-600">
                  No other participants available to transfer moderator role to.
                </p>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-mocha-700 mb-1.5">
                    Select participant:
                  </label>
                  <select
                    value={selectedParticipant}
                    onChange={(e) => setSelectedParticipant(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Choose a participant...</option>
                    {availableParticipants.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            <div className="flex space-x-2.5 mt-5">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setSelectedParticipant('');
                }}
                className="btn btn-quiet flex-1 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleTransferModerator}
                disabled={!selectedParticipant}
                className="btn btn-secondary flex-1 px-4 py-2"
              >
                Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ModeratorControls;