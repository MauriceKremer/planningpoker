import { memo } from 'react';
import type { SessionUser } from '../protocol/session';

// Special cards beside the numeric estimates (server accepts these values).
const SPECIAL_OPTIONS = [
  { value: '☕', label: 'Break', description: 'Need a break' },
  { value: '❓', label: 'Question', description: 'Have questions' },
] as const;

interface VotingCardsProps {
  cardSet: string[];
  onVote: (value: string) => void;
  currentUserVote?: string | null;
  isVotingOpen: boolean;
  currentUser: SessionUser | null;
  onStopRound?: () => void;
}

const VotingCards = memo(({ cardSet, onVote, currentUserVote, isVotingOpen, currentUser, onStopRound }: VotingCardsProps) => {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-base font-semibold text-mocha-800">
          {isVotingOpen ? 'Select Your Estimate' : 'Voting Closed'}
        </h3>

        {currentUser?.isModerator && isVotingOpen && (
          <button
            onClick={onStopRound}
            className="btn btn-quiet text-xs px-2.5 py-1 min-h-[44px] text-clay-600 border-clay-200 hover:bg-clay-50 hover:border-clay-300"
          >
            Stop Voting
          </button>
        )}
      </div>

      {currentUserVote && (
        <div className="mb-2.5 px-3 py-1.5 panel-sage text-sage-700 text-sm animate-rise-in">
          <p>You voted: <span className="font-bold">{currentUserVote}</span></p>
        </div>
      )}

      <div className="mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-mocha-400 mb-1.5">Story Points</h4>
        <div className="grid grid-cols-4 gap-2">
          {cardSet.map((value, i) => {
            const isSelected = currentUserVote === value;
            return (
              <button
                key={value}
                onClick={() => onVote(value)}
                disabled={!isVotingOpen}
                style={{ animationDelay: `${i * 30}ms` }}
                className={`
                  aspect-square border-2 rounded-lg transition-all
                  flex items-center justify-center text-lg font-bold
                  disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-95
                  ${isSelected
                    ? 'bg-linear-to-b/srgb from-ember-500 to-ember-600 border-ember-600 text-white shadow-button scale-105 animate-vote-lock'
                    : 'bg-cream-100/90 border-cream-400 text-mocha-700 hover:bg-ember-50 hover:border-ember-300 hover:text-ember-700 enabled:hover:-translate-y-0.5 animate-rise-in'
                  }
                  ${!isVotingOpen && isSelected ? 'ring-2 ring-ember-300' : ''}
                `}
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-mocha-400 mb-1.5">Other Options</h4>
        <div className="grid grid-cols-2 gap-2">
          {SPECIAL_OPTIONS.map((option, i) => {
            const isSelected = currentUserVote === option.value;
            return (
              <button
                key={option.value}
                onClick={() => onVote(option.value)}
                disabled={!isVotingOpen}
                title={option.description}
                style={{ animationDelay: `${(cardSet.length + i) * 30}ms` }}
                className={`
                  h-14 border-2 rounded-lg transition-all
                  flex flex-col items-center justify-center
                  disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-95
                  ${isSelected
                    ? 'bg-linear-to-b/srgb from-caramel-400 to-caramel-600 border-caramel-600 text-white shadow-button scale-105 animate-vote-lock'
                    : 'bg-caramel-50/80 border-caramel-200 text-caramel-800 hover:bg-caramel-100 hover:border-caramel-300 enabled:hover:-translate-y-0.5 animate-rise-in'
                  }
                  ${!isVotingOpen && isSelected ? 'ring-2 ring-caramel-300' : ''}
                `}
              >
                <span className="text-xl leading-none">{option.value}</span>
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!isVotingOpen && (
        <p className="mt-3 text-xs text-mocha-400">
          Waiting for voting to be reset by the moderator.
        </p>
      )}
    </div>
  );
});

export default VotingCards;