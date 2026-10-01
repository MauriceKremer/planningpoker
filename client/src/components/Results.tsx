import { memo } from 'react';
import type { VotesMap } from '../protocol/events';

interface ResultsProps {
  votes: VotesMap;
  cardSet: string[];
}

const Results = memo(({ votes, cardSet }: ResultsProps) => {
  const voteValues = Object.values(votes);
  const totalVotes = voteValues.length;
  const displayCards = [...cardSet, '☕', '❓'];

  // Every card shows a row (count 0 included); votes outside the set get their own.
  const counts: Record<string, number> = Object.fromEntries(
    displayCards.map(value => [value, 0]),
  );
  voteValues.forEach(vote => {
    counts[vote] = (counts[vote] ?? 0) + 1;
  });
  const sortedCards = displayCards.filter(card => Object.hasOwn(counts, card));

  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-mocha-500">Vote Distribution</h4>
      <div className="mt-2.5 space-y-1.5">
        {sortedCards.map((card, i) => {
          const count = counts[card] ?? 0;
          const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const stagger = { animationDelay: `${i * 45}ms` };

          return (
            <div key={card} style={stagger} className={`flex items-center gap-2 text-sm animate-rise-in ${count === 0 ? 'opacity-55' : undefined}`}>
              <div className="w-6 text-center shrink-0">
                <span className="font-bold text-mocha-800">{card}</span>
              </div>

              <div className="flex-1">
                <div className="w-full bg-cream-200/80 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-4 rounded-full origin-left animate-grow-x transition-all duration-300 ease-out ${
                      count > 0 ? 'bg-linear-to-r/srgb from-ember-500 to-ember-600' : 'bg-transparent'
                    }`}
                    style={{ ...stagger, width: `${Math.max(percentage, count > 0 ? 6 : 0)}%` }}
                  />
                </div>
              </div>

              <div className="w-10 text-right shrink-0 tabular-nums">
                <span className={`text-xs font-semibold ${count > 0 ? 'text-mocha-700' : 'text-mocha-300'}`}>
                  {count}
                </span>
              </div>

              <div className="w-8 text-right shrink-0 tabular-nums">
                <span className={`text-xs font-medium ${count > 0 ? 'text-mocha-500' : 'text-mocha-300'}`}>
                  {percentage}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default Results;