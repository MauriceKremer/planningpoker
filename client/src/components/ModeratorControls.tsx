import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { saveCardSetPreference } from '../utils/cardSetStorage';
import type { SessionState } from '../protocol/session';

const PREDEFINED_CARD_SETS = {
  fibonacci: { name: 'Fibonacci', values: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89'] },
  modifiedFibonacci: { name: 'Modified Fibonacci', values: ['0', '0.5', '1', '2', '3', '5', '8', '13', '20', '40', '100'] },
  mikeCohn: { name: 'Mike Cohn', values: ['0', '1', '2', '3', '5', '8', '13', '20', '40', '100'] },
  tshirt: { name: 'T-Shirt', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] }
} as const;

type CardSetKey = keyof typeof PREDEFINED_CARD_SETS;

interface ModeratorControlsProps {
  session: SessionState | null;
  onTestSound?: () => void;
  onUpdateCardSet?: (cardSet: string[]) => void;
  onTransferModerator?: (targetUserId: string) => void;
  onCloseSession?: () => void;
}

const Modal = ({ titleId, title, onClose, children }: { titleId: string; title: string; onClose: () => void; children: ReactNode }) => (
  <div
    className="app-overlay fixed inset-0 bg-mocha-900/50 backdrop-blur-sm flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }}
  >
    <div className="card-lg p-5 max-w-md w-full mx-4" tabIndex={-1} autoFocus>
      <h3 id={titleId} className="text-base font-semibold text-mocha-800 mb-4">{title}</h3>
      {children}
    </div>
  </div>
);

const ModeratorControls = ({ session, onTestSound, onUpdateCardSet, onTransferModerator, onCloseSession }: ModeratorControlsProps) => {
  const [showCardSetModal, setShowCardSetModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedCardSet, setSelectedCardSet] = useState<CardSetKey>('fibonacci');
  const [customCardSet, setCustomCardSet] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState('');

  if (!session) return null;

  const currentCardSet = session.cardSet || [...PREDEFINED_CARD_SETS.fibonacci.values];
  const availableParticipants = Object.values(session.users || {})
    .filter(user => !user.isModerator && user.isOnline);

  const handleCardSetUpdate = () => {
    const resolveCardSet = (): { values: string[]; type: string } | null => {
      if (isCustom) {
        const values = customCardSet.split(',').map(v => v.trim()).filter(Boolean);
        if (values.length === 0) {
          alert('Please enter at least one card value');
          return null;
        }
        return { values, type: 'custom' };
      }
      return { values: [...PREDEFINED_CARD_SETS[selectedCardSet].values], type: selectedCardSet };
    };

    const cardSet = resolveCardSet();
    if (!cardSet) return;

    saveCardSetPreference(cardSet.values, cardSet.type);
    onUpdateCardSet?.(cardSet.values);
    setShowCardSetModal(false);
  };

  const handleTransferModerator = () => {
    const target = session.users[selectedParticipant];
    if (!target) {
      alert('Please select a participant to transfer moderator role to');
      return;
    }
    if (window.confirm(`Are you sure you want to transfer moderator role to ${target.name}? This action cannot be undone.`)) {
      onTransferModerator?.(selectedParticipant);
      setShowTransferModal(false);
      setSelectedParticipant('');
    }
  };

  const handleCloseSession = () => {
    if (window.confirm('Are you sure you want to close this session? This will end the session for all participants and cannot be undone.')) {
      onCloseSession?.();
    }
  };

  return (
    <>
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-mocha-800 text-sm">Moderator Controls</h2>
            <p className="hidden sm:block text-xs text-mocha-500 mt-0.5">
              Card Set: <span className="text-mocha-600 font-medium">{currentCardSet.join(', ')}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1 mt-2 sm:mt-0 sm:justify-end">
            <button
              onClick={() => setShowTransferModal(true)}
              className="btn btn-secondary text-xs px-2 py-1 min-h-[44px]"
              title="Transfer moderator role to another participant"
              disabled={availableParticipants.length === 0}
            >
              👤 Transfer
            </button>

            <button
              onClick={() => setShowCardSetModal(true)}
              className="btn btn-secondary text-xs px-2 py-1 min-h-[44px]"
              title="Configure card values for estimation"
            >
              🃏 Cards
            </button>

            {onTestSound && (
              <button
                onClick={onTestSound}
                className="btn btn-quiet text-xs px-2 py-1 min-h-[44px] min-w-[44px] text-honey-700 hover:bg-honey-50 hover:border-honey-300"
                title="Test sound notification for all participants"
              >
                🔔
              </button>
            )}

            <button
              onClick={handleCloseSession}
              className="btn btn-danger text-xs px-2 py-1 min-h-[44px]"
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

      {showCardSetModal && (
        <Modal titleId="card-set-modal-title" title="Configure Card Set" onClose={() => setShowCardSetModal(false)}>
          <div className="space-y-3">
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
                        onChange={(e) => {
                          const value = e.target.value;
                          // Sound cast: a radio value outside the registry
                          // can only exist if PREDEFINED_CARD_SETS is edited
                          // without this guard being updated.
                          if (value in PREDEFINED_CARD_SETS) {
                            setSelectedCardSet(value as CardSetKey);
                          }
                        }}
                      />
                      <span className="font-medium">{set.name}</span>
                      <span className="text-xs text-mocha-400">({set.values.join(', ')})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

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
            <button onClick={handleCardSetUpdate} className="btn btn-primary flex-1 py-2 px-4 min-h-[44px]">
              Update Card Set
            </button>
            <button onClick={() => setShowCardSetModal(false)} className="btn btn-quiet flex-1 py-2 px-4 min-h-[44px]">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {showTransferModal && (
        <Modal titleId="transfer-modal-title" title="Transfer Moderator Role" onClose={() => { setShowTransferModal(false); setSelectedParticipant(''); }}>
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
              onClick={() => { setShowTransferModal(false); setSelectedParticipant(''); }}
              className="btn btn-quiet flex-1 px-4 py-2 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleTransferModerator}
              disabled={!selectedParticipant}
              className="btn btn-secondary flex-1 px-4 py-2 min-h-[44px]"
            >
              Transfer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};

export default ModeratorControls;