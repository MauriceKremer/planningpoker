import React from 'react';

const VotingCards = React.memo(({ cardSet, onVote, currentUserVote, isVotingOpen, currentUser, onStopRound }) => {
  // Special voting options
  const specialOptions = [
    { value: '☕', label: 'Break', description: 'Need a break' },
    { value: '❓', label: 'Question', description: 'Have questions' }
  ];
  
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-mocha-800">
          {isVotingOpen ? 'Select Your Estimate' : 'Voting Closed'}
        </h3>
        
        {currentUser?.isModerator && isVotingOpen && (
          <button
            onClick={onStopRound}
            className="btn btn-quiet text-xs px-2.5 py-1 text-clay-600 border-clay-200 hover:bg-clay-50 hover:border-clay-300"
          >
            Stop Voting
          </button>
        )}
      </div>
      
      {currentUserVote && (
        <div className="mb-3 px-3 py-1.5 panel-sage text-sage-700 text-sm">
          <p>You voted: <span className="font-bold">{currentUserVote}</span></p>
        </div>
      )}

      {/* Regular estimation cards */}
      <div className="mb-3.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-mocha-400 mb-1.5">Story Points</h4>
        <div className="grid grid-cols-4 gap-2.5">
          {cardSet.map((value) => {
            const isSelected = currentUserVote === value;
            return (
              <button
                key={value}
                onClick={() => onVote(value)}
                disabled={!isVotingOpen}
                className={`
                  aspect-square border-2 rounded-lg transition-all
                  flex items-center justify-center text-lg font-bold
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${isSelected 
                    ? 'bg-gradient-to-b from-ember-500 to-ember-600 border-ember-600 text-white shadow-button transform scale-105' 
                    : 'bg-cream-100/90 border-cream-400 text-mocha-700 hover:bg-ember-50 hover:border-ember-300 hover:text-ember-700'
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

      {/* Special options */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-mocha-400 mb-1.5">Other Options</h4>
        <div className="grid grid-cols-2 gap-2.5">
          {specialOptions.map((option) => {
            const isSelected = currentUserVote === option.value;
            return (
              <button
                key={option.value}
                onClick={() => onVote(option.value)}
                disabled={!isVotingOpen}
                title={option.description}
                className={`
                  h-14 border-2 rounded-lg transition-all
                  flex flex-col items-center justify-center
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${isSelected 
                    ? 'bg-gradient-to-b from-caramel-400 to-caramel-600 border-caramel-600 text-white shadow-button transform scale-105' 
                    : 'bg-caramel-50/80 border-caramel-200 text-caramel-800 hover:bg-caramel-100 hover:border-caramel-300'
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