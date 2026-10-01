import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import VotingCards from '../VotingCards';

const currentUser = { id: 'u-1', name: 'Alice', isModerator: true };

const renderCards = (currentUserVote: string | null = null) =>
  render(
    <VotingCards
      cardSet={['1', '5', '8']}
      onVote={vi.fn()}
      currentUserVote={currentUserVote}
      isVotingOpen={true}
      currentUser={currentUser}
    />
  );

describe('VotingCards', () => {
  test('marks the selected card with the lock-in animation', () => {
    renderCards('5');
    expect(screen.getByRole('button', { name: '5', exact: true })).toHaveClass('animate-vote-lock');
    expect(screen.getByRole('button', { name: '1', exact: true })).toHaveClass('animate-rise-in');
  });

  test('unselected cards provide active press feedback', () => {
    renderCards();
    for (const value of ['1', '5', '8']) {
      expect(screen.getByRole('button', { name: value, exact: true })).toHaveClass('active:scale-95');
    }
  });

  test('clicking a card submits the estimate for optimistic lock-in', () => {
    const onVote = vi.fn();
    render(
      <VotingCards cardSet={['1', '5', '8']} onVote={onVote} currentUserVote={null} isVotingOpen={true} currentUser={currentUser} />
    );
    fireEvent.click(screen.getByRole('button', { name: '8', exact: true }));
    expect(onVote).toHaveBeenCalledWith('8');
  });

  test('staggered card entry delays each card', () => {
    renderCards();
    expect(screen.getByRole('button', { name: '5', exact: true })).toHaveStyle({ animationDelay: '30ms' });
  });
});