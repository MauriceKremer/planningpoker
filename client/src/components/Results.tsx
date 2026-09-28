import React from 'react';
import type { VotesMap } from '../protocol/events';

interface ResultsProps {
  votes: VotesMap;
  cardSet: string[];
}

const Results = React.memo(({ votes, cardSet }: ResultsProps) => {
  const voteValues = Object.values(votes);

  // Create vote distribution including all card values
  const voteDistribution: Record<string, number> = {};

  // Initialize all card set values with 0
  [...cardSet, '☕', '❓'].forEach(value => {
    voteDistribution[value] = 0;
  });

  // Count actual votes (the `?? 0` + 1 form covers both the "already present"
  // and the "vote outside the standard set" branch of the original code).
  voteValues.forEach(vote => {
    voteDistribution[vote] = (voteDistribution[vote] ?? 0) + 1;
  });

  // Sort card values for display - maintain exact card set order
  const sortedCards = [...cardSet, '☕', '❓'].filter(card => Object.hasOwn(voteDistribution, card));

  return (
    <div className="space-y-2.5">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-mocha-400 mb-1.5">Vote Distribution</h4>
        <div className="space-y-1">
          {sortedCards.map((vote) => {
            const count = voteDistribution[vote] ?? 0;
            const totalVotes = voteValues.length;
            const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

            return (
              <div key={vote} className="flex items-center space-x-2 text-sm">
                {/* Vote label in front */}
                <div className="w-6 text-center shrink-0">
                  <span className="font-semibold text-mocha-700">{vote}</span>
                </div>

                {/* Bar chart */}
                <div className="flex-1">
                  <div className="w-full bg-cream-200/80 rounded-full h-3.5 relative overflow-hidden">
                    <div
                      className={`h-3.5 rounded-full transition-all duration-300 ease-out ${
                        count > 0 ? 'bg-gradient-to-r from-ember-500 to-ember-600' : 'bg-transparent'
                      }`}
                      style={{ width: `${Math.max(percentage, count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>

                {/* Count after the bar */}
                <div className="w-10 text-right shrink-0">
                  <span className={`text-xs ${count > 0 ? 'font-medium text-mocha-700' : 'text-mocha-300'}`}>
                    {count}
                  </span>
                </div>

                {/* Percentage */}
                <div className="w-8 text-right shrink-0">
                  <span className={`text-xs ${count > 0 ? 'text-mocha-500' : 'text-mocha-300'}`}>
                    {totalVotes > 0 ? `${Math.round((count / totalVotes) * 100)}%` : '0%'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default Results;