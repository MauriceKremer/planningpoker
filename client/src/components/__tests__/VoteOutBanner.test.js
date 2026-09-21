import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import VoteOutBanner from '../VoteOutBanner';

const baseVoteOut = {
  targetUserId: 'u-3',
  targetUserName: 'Charlie',
  initiatedByUserId: 'u-2',
  initiatedByName: 'Bob',
  eligibleVoters: ['u-1', 'u-2', 'u-4'],
  yesVotes: 0,
  noVotes: 0,
  requiredYesVotes: 2,
  thresholdPercent: 25,
};

describe('VoteOutBanner', () => {
  test('renders vote-out prompt for eligible voter', () => {
    render(
      <VoteOutBanner
        activeVoteOut={baseVoteOut}
        currentUserId="u-1"
        onVote={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByText(/Vote to remove Charlie/i)).toBeInTheDocument();
    expect(screen.getByText(/0 of 2 required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No/i })).toBeInTheDocument();
  });

  test('does not show vote buttons for the target', () => {
    render(
      <VoteOutBanner
        activeVoteOut={baseVoteOut}
        currentUserId="u-3"
        onVote={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByText(/Vote to remove Charlie/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Yes/i })).not.toBeInTheDocument();
  });

  test('does not show vote buttons for ineligible user', () => {
    render(
      <VoteOutBanner
        activeVoteOut={baseVoteOut}
        currentUserId="u-5"
        onVote={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Yes/i })).not.toBeInTheDocument();
  });

  test('calls onVote with yes', () => {
    const onVote = jest.fn();
    render(
      <VoteOutBanner
        activeVoteOut={baseVoteOut}
        currentUserId="u-1"
        onVote={onVote}
        onCancel={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Yes/i }));
    expect(onVote).toHaveBeenCalledWith('yes');
  });

  test('calls onVote with no', () => {
    const onVote = jest.fn();
    render(
      <VoteOutBanner
        activeVoteOut={baseVoteOut}
        currentUserId="u-1"
        onVote={onVote}
        onCancel={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /No/i }));
    expect(onVote).toHaveBeenCalledWith('no');
  });

  test('shows cancel button only for initiator', () => {
    const { rerender } = render(
      <VoteOutBanner
        activeVoteOut={baseVoteOut}
        currentUserId="u-2"
        onVote={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();

    rerender(
      <VoteOutBanner
        activeVoteOut={baseVoteOut}
        currentUserId="u-1"
        onVote={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
  });

  test('renders nothing when activeVoteOut is null', () => {
    const { container } = render(
      <VoteOutBanner
        activeVoteOut={null}
        currentUserId="u-1"
        onVote={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
