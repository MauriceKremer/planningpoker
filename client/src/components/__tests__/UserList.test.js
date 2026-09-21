import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserList from '../UserList';

const baseUsers = {
  'u-1': { id: 'u-1', name: 'Alice', isModerator: true, isOnline: true, joinedAt: '2024-01-01T00:00:00.000Z' },
  'u-2': { id: 'u-2', name: 'Bob', isModerator: false, isOnline: true, joinedAt: '2024-01-01T00:00:01.000Z' },
  'u-3': { id: 'u-3', name: 'Charlie', isModerator: false, isOnline: true, joinedAt: '2024-01-01T00:00:02.000Z' },
};

describe('UserList', () => {
  test('shows vote-out button for other participants when no active vote-out', () => {
    render(
      <UserList
        users={baseUsers}
        votes={{}}
        votingComplete={false}
        currentUser={baseUsers['u-1']}
        onStartVoteOut={jest.fn()}
      />
    );

    expect(screen.getAllByTitle(/Start vote to remove participant/i)).toHaveLength(2);
  });

  test('hides vote-out button when a vote-out is active', () => {
    render(
      <UserList
        users={baseUsers}
        votes={{}}
        votingComplete={false}
        currentUser={baseUsers['u-1']}
        onStartVoteOut={jest.fn()}
        activeVoteOut={{ targetUserId: 'u-3' }}
      />
    );

    expect(screen.queryByTitle(/Start vote to remove participant/i)).not.toBeInTheDocument();
  });

  test('does not show vote-out button for current user row', () => {
    render(
      <UserList
        users={baseUsers}
        votes={{}}
        votingComplete={false}
        currentUser={baseUsers['u-1']}
        onStartVoteOut={jest.fn()}
      />
    );

    // There are 2 vote-out buttons (for Bob and Charlie), none for Alice.
    expect(screen.getAllByTitle(/Start vote to remove participant/i)).toHaveLength(2);
  });

  test('calls onStartVoteOut with target user id', () => {
    const onStartVoteOut = jest.fn();
    render(
      <UserList
        users={baseUsers}
        votes={{}}
        votingComplete={false}
        currentUser={baseUsers['u-1']}
        onStartVoteOut={onStartVoteOut}
      />
    );

    const buttons = screen.getAllByTitle(/Start vote to remove participant/i);
    fireEvent.click(buttons[0]);
    expect(onStartVoteOut).toHaveBeenCalledWith('u-2');
  });
});
