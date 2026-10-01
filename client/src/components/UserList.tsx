import { memo, useState, type KeyboardEvent } from 'react';
import type { User, ActiveVoteOutState } from '../protocol/events';
import type { SessionUser } from '../protocol/session';
import Avatar from './Avatar';

interface UserListProps {
  users: Record<string, User>;
  votes: Record<string, string>;
  votingComplete?: boolean;
  votedUserIds?: string[];
  currentUser: SessionUser | null;
  onRemoveParticipant?: (userId: string) => void;
  isVotingOpen?: boolean;
  onUpdateUserName?: (newName: string) => void;
  onCustomizeAvatar?: () => void;
  activeVoteOut?: ActiveVoteOutState | null;
  onStartVoteOut?: (userId: string) => void;
}

const UserList = memo(({
  users,
  votes,
  votingComplete,
  votedUserIds,
  currentUser,
  onRemoveParticipant,
  isVotingOpen,
  onUpdateUserName,
  onCustomizeAvatar,
  activeVoteOut,
  onStartVoteOut,
}: UserListProps) => {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const usersList = Object.values(users).sort((a, b) => {
    if (votingComplete && votes) {
      // Highest vote first; numeric values outrank special cards (☕ ❓),
      // which sort alphabetically. Unvoted participants sink to the bottom.
      const numA = parseFloat(votes[a.id] ?? '');
      const numB = parseFloat(votes[b.id] ?? '');
      const numeric = (n: number) => !Number.isNaN(n);
      if (numeric(numA) !== numeric(numB)) return numeric(numA) ? -1 : 1;
      if (numeric(numA) && numeric(numB)) return numB - numA;
      return (votes[a.id] ?? '').localeCompare(votes[b.id] ?? '');
    }
    if (a.isModerator !== b.isModerator) return a.isModerator ? -1 : 1;
    return new Date(a.joinedAt ?? 0).getTime() - new Date(b.joinedAt ?? 0).getTime();
  });

  const startEditingName = (user: User) => {
    if (currentUser?.id === user.id) {
      setEditingUserId(user.id);
      setEditingName(user.name);
    }
  };

  const stopEditingName = () => {
    setEditingUserId(null);
    setEditingName('');
  };

  const handleNameSave = () => {
    const name = editingName.trim();
    if (name && name !== currentUser?.name) onUpdateUserName?.(name);
    stopEditingName();
  };

  const handleNameKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSave();
    if (e.key === 'Escape') stopEditingName();
  };

  return (
    <div className="space-y-1">
      {usersList.map((user) => {
        const countdown = user.countdownSeconds ?? 0;
        // While the round is open the client only knows WHO has voted
        // (`votedUserIds`, ids from the server) — card values are hidden.
        const hasVoted = isVotingOpen && !votingComplete
          ? (votedUserIds ?? []).includes(user.id)
          : false;
        const vote = votingComplete ? votes[user.id] : undefined;
        const ring = hasVoted
          ? 'voted'
          : isVotingOpen && !votingComplete ? 'waiting' : null;

        return (
          <div
            key={user.id}
            data-testid={`user-${user.name}`}
            className={`flex items-center justify-between px-1.5 py-1 rounded-lg border transition-colors ${
              currentUser?.id === user.id
                ? 'bg-ember-50/80 border-ember-200'
                : 'bg-cream-100/70 border-transparent'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Avatar
                id={user.id}
                name={user.name}
                avatar={user.avatar}
                ring={ring}
                onClick={currentUser?.id === user.id ? onCustomizeAvatar : undefined}
              />
              <div>
                <div className="flex items-center space-x-2">
                  {editingUserId === user.id ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={handleNameKey}
                        onBlur={handleNameSave}
                        className="text-xs font-medium px-1.5 py-0.5 bg-white/80 border border-ember-300 rounded focus:outline-none focus:ring-1 focus:ring-ember-400"
                        placeholder="Enter your name"
                        maxLength={30}
                        autoFocus
                        autoComplete="off"
                      />
                      <button
                        onClick={handleNameSave}
                        className="text-sage-600 hover:text-sage-700 text-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Save name"
                        aria-label="Save name"
                      >
                        ✓
                      </button>
                      <button
                        onClick={stopEditingName}
                        className="text-clay-600 hover:text-clay-700 text-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Cancel"
                        aria-label="Cancel editing"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`text-xs font-medium text-mocha-800 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-1 ${
                        currentUser?.id === user.id
                          ? 'cursor-pointer hover:text-ember-700 hover:underline'
                          : 'cursor-default'
                      }`}
                      onClick={() => startEditingName(user)}
                      disabled={currentUser?.id !== user.id}
                      title={currentUser?.id === user.id ? 'Click to edit your name' : undefined}
                    >
                      {user.name}
                    </button>
                  )}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${user.isOnline ? 'bg-sage-500' : 'bg-cream-400'}`}
                       title={user.isOnline ? 'Online' : 'Offline'} />
                  {countdown > 0 && (
                    <span className="badge badge-clay font-mono">
                      {countdown}s
                    </span>
                  )}
                </div>
                {user.isModerator && (
                  <span className="badge badge-honey ml-0.5">Moderator</span>
                )}
                {countdown > 0 && (
                  <div className="text-xs text-clay-600 mt-0.5">
                    Will be removed due to inactivity
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {votingComplete && vote !== undefined ? (
                <span className="badge badge-ember font-semibold animate-badge-pop">
                  {vote}
                </span>
              ) : hasVoted ? (
                <span className="badge badge-sage animate-badge-pop">
                  ✓ Voted
                </span>
              ) : isVotingOpen && !votingComplete ? (
                <span className="badge badge-quiet">
                  Waiting...
                </span>
              ) : null}

              <div className="flex items-center space-x-1">
                {currentUser?.id !== user.id && !activeVoteOut && onStartVoteOut && (
                  <button
                    onClick={() => onStartVoteOut?.(user.id)}
                    className="text-ember-600 hover:text-ember-700 text-sm px-1.5 py-0.5 hover:bg-ember-50 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Start vote to remove participant"
                    aria-label={`Start vote to remove ${user.name}`}
                  >
                    🗳️
                  </button>
                )}
                {currentUser?.isModerator && !user.isModerator && onRemoveParticipant && (
                  <button
                    onClick={() => onRemoveParticipant?.(user.id)}
                    className="text-clay-600 hover:text-clay-700 text-sm px-1.5 py-0.5 hover:bg-clay-50 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Remove participant"
                    aria-label={`Remove ${user.name}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {usersList.length === 0 && (
        <p className="text-mocha-400 text-center py-2 text-sm">No participants yet</p>
      )}
    </div>
  );
});

export default UserList;