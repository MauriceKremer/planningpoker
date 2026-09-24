import React, { useState } from 'react';

const UserList = React.memo(({ users, votes, votingComplete, votedUserIds, currentUser, onRemoveParticipant, isVotingOpen, onUpdateUserName, activeVoteOut, onStartVoteOut }) => {
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingName, setEditingName] = useState('');
  
  // Sort users based on voting state
  const usersList = Object.values(users).sort((a, b) => {
    if (votingComplete && votes) {
      // When voting is complete, sort by vote value (highest to lowest)
      const voteA = votes[a.id];
      const voteB = votes[b.id];
      
      // Handle users without votes
      if (!voteA && !voteB) return 0;
      if (!voteA) return 1;
      if (!voteB) return -1;
      
      // Convert to numbers for comparison, handle special votes
      const numA = parseFloat(voteA);
      const numB = parseFloat(voteB);
      
      if (!isNaN(numA) && !isNaN(numB)) {
        return numB - numA; // Highest first
      }
      
      // If one is numeric and other isn't, numeric comes first
      if (!isNaN(numA) && isNaN(numB)) return -1;
      if (isNaN(numA) && !isNaN(numB)) return 1;
      
      // Both non-numeric, sort alphabetically
      return voteA.toString().localeCompare(voteB.toString());
    } else {
      // Default sorting: moderator first, then by join time
      if (a.isModerator && !b.isModerator) return -1;
      if (!a.isModerator && b.isModerator) return 1;
      return new Date(a.joinedAt) - new Date(b.joinedAt);
    }
  });

  const handleStartVoteOut = (userId) => {
    if (onStartVoteOut && !activeVoteOut) {
      onStartVoteOut(userId);
    }
  };

  const handleRemoveUser = (userId) => {
    if (onRemoveParticipant) {
      onRemoveParticipant(userId);
    }
  };

  const handleNameClick = (user) => {
    // Only allow users to edit their own name
    if (currentUser?.id === user.id) {
      setEditingUserId(user.id);
      setEditingName(user.name);
    }
  };

  const handleNameSave = () => {
    if (editingName.trim() && editingName.trim() !== currentUser?.name) {
      if (onUpdateUserName) {
        onUpdateUserName(editingName.trim());
      }
    }
    setEditingUserId(null);
    setEditingName('');
  };

  const handleNameCancel = () => {
    setEditingUserId(null);
    setEditingName('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  };

  return (
    <div className="space-y-1">
      {usersList.map((user) => {
        // While the round is open the client only knows WHO has voted
        // (`votedUserIds`, ids from the server) — card values are hidden.
        const hasVoted = votingComplete
          ? votes[user.id] !== undefined
          : isVotingOpen
            ? (votedUserIds || []).includes(user.id)
            : false;
        const vote = votingComplete ? votes[user.id] : null;

        return (
          <div 
            key={user.id} 
            className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition-colors ${
              currentUser?.id === user.id
                ? 'bg-ember-50/80 border-ember-200'
                : 'bg-cream-100/70 border-transparent'
            }`}
          >
            <div className="flex items-center space-x-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                user.isModerator
                  ? 'bg-gradient-to-b from-honey-400 to-honey-500 shadow-button'
                  : 'bg-gradient-to-b from-mocha-500 to-mocha-700'
              }`}>
                <span className="text-white text-xs font-bold leading-none">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  {editingUserId === user.id ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={handleKeyPress}
                        onBlur={handleNameSave}
                        className="text-xs font-medium px-1.5 py-0.5 bg-white/80 border border-ember-300 rounded focus:outline-none focus:ring-1 focus:ring-ember-400"
                        placeholder="Enter your name"
                        maxLength={30}
                        autoFocus
                        autoComplete="off"
                      />
                      <button
                        onClick={handleNameSave}
                        className="text-sage-600 hover:text-sage-700 text-xs"
                        title="Save name"
                      >
                        ✓
                      </button>
                      <button
                        onClick={handleNameCancel}
                        className="text-clay-600 hover:text-clay-700 text-xs"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span 
                      className={`text-xs font-medium text-mocha-800 ${
                        currentUser?.id === user.id 
                          ? 'cursor-pointer hover:text-ember-700 hover:underline' 
                          : ''
                      }`}
                      onClick={() => handleNameClick(user)}
                      title={currentUser?.id === user.id ? 'Click to edit your name' : ''}
                    >
                      {user.name}
                    </span>
                  )}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${user.isOnline ? 'bg-sage-500' : 'bg-cream-400'}`} 
                       title={user.isOnline ? 'Online' : 'Offline'} />
                  {user.countdownSeconds > 0 && (
                    <span className="badge badge-clay font-mono">
                      {user.countdownSeconds}s
                    </span>
                  )}
                </div>
                {user.isModerator && (
                  <span className="badge badge-honey ml-0.5">Moderator</span>
                )}
                {user.countdownSeconds > 0 && (
                  <div className="text-xs text-clay-600 mt-0.5">
                    Will be removed due to inactivity
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {votingComplete && vote !== undefined ? (
                <span className="badge badge-ember font-semibold">
                  {vote}
                </span>
              ) : hasVoted && isVotingOpen ? (
                <span className="badge badge-sage">
                  ✓ Voted
                </span>
              ) : isVotingOpen && !votingComplete ? (
                <span className="badge badge-quiet">
                  Waiting...
                </span>
              ) : null}
              
              <div className="flex items-center space-x-1">
                {/* Vote-out button for participants */}
                {currentUser?.id !== user.id && !activeVoteOut && onStartVoteOut && (
                  <button
                    onClick={() => handleStartVoteOut(user.id)}
                    className="text-ember-600 hover:text-ember-700 text-sm px-1.5 py-0.5 hover:bg-ember-50 rounded"
                    title="Start vote to remove participant"
                  >
                    🗳️
                  </button>
                )}
                {/* Remove button for moderator */}
                {currentUser?.isModerator && !user.isModerator && onRemoveParticipant && (
                  <button
                    onClick={() => handleRemoveUser(user.id)}
                    className="text-clay-600 hover:text-clay-700 text-sm px-1.5 py-0.5 hover:bg-clay-50 rounded"
                    title="Remove participant"
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
        <p className="text-mocha-400 text-center py-3 text-sm">No participants yet</p>
      )}
    </div>
  );
});

export default UserList;