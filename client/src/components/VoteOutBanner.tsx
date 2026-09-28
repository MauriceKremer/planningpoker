import type { ActiveVoteOutState } from '../protocol/events';

interface VoteOutBannerProps {
  activeVoteOut: ActiveVoteOutState | null | undefined;
  currentUserId?: string;
  onVote: (vote: 'yes' | 'no') => void;
  onCancel: () => void;
}

const VoteOutBanner = ({ activeVoteOut, currentUserId, onVote, onCancel }: VoteOutBannerProps) => {
  if (!activeVoteOut) return null;

  const {
    targetUserId,
    targetUserName,
    initiatedByName,
    eligibleVoters,
    yesVotes,
    noVotes,
    requiredYesVotes,
  } = activeVoteOut;

  const isTarget = currentUserId === targetUserId;
  const canVote = currentUserId != null && eligibleVoters.includes(currentUserId) && !isTarget;
  const isInitiator = currentUserId === activeVoteOut.initiatedByUserId;

  const handleVote = (vote: 'yes' | 'no') => () => onVote(vote);

  return (
    <div role="alert" className="panel-clay" data-testid="vote-out-banner">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-clay-800 text-sm">Vote to remove {targetUserName}</h2>
          <p className="text-xs text-clay-700">
            Started by {initiatedByName} · {yesVotes} of {requiredYesVotes} required yes votes
            {noVotes > 0 && ` · ${noVotes} no`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canVote && (
            <>
              <button
                onClick={handleVote('yes')}
                className="btn btn-danger text-xs px-2.5 py-1"
              >
                Yes
              </button>
              <button
                onClick={handleVote('no')}
                className="btn btn-quiet text-xs px-2.5 py-1"
              >
                No
              </button>
            </>
          )}
          {isInitiator && (
            <button
              onClick={onCancel}
              className="btn btn-quiet text-xs px-2.5 py-1"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      {isTarget && (
        <p className="text-xs text-clay-700 mt-2">Other participants are voting to remove you from this session.</p>
      )}
    </div>
  );
};

export default VoteOutBanner;