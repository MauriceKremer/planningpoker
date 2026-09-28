import { memo } from 'react';
import type { VotesMap } from '../protocol/events';

interface ResultsProps {
  votes: VotesMap;
  cardSet: string[];
}

const Results = memo(({ votes, cardSet }: ResultsProps) => {
  const voteValues = Object.values(votes);
  const displayCards = [...cardSet, '☕', '❓'];

  // Every card shows a row (count 0 included); votes outside the set get their own.
  const voteDistribution: Record<string, number> = Object.fromEntries(
    displayCards.map(value => [value, 0]),
  );
  voteValues.forEach(vote => {
    voteDistribution[vote] = (voteDistribution[vote] ?? 0) + 1;
  });
  const sortedCards = displayCards.filter(card => Object.hasOwn(voteDistribution, card));

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
                <div className="w-6 text-center shrink-0">
                  <span className="font-semibold text-mocha-700">{vote}</span>
                </div>

                <div className="flex-1">
                  <div className="w-full bg-cream-200/80 rounded-full h-3.5 relative overflow-hidden">
                    <div
                      className={`h-3.5 rounded-full transition-all duration-300 ease-out ${
                        count > 0 ? 'bg-linear-to-r/srgb from-ember-500 to-ember-600' : 'bg-transparent'
                      }`}
                      style={{ width: `${Math.max(percentage, count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>

                <div className="w-10 text-right shrink-0">
                  <span className={`text-xs ${count > 0 ? 'font-medium text-mocha-700' : 'text-mocha-300'}`}>
                    {count}
                  </span>
                </div>

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