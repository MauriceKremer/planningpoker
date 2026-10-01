import { memo } from 'react';
import type { Avatar as AvatarConfig } from '../protocol/events';
import { avatarColorHex, defaultAvatarFor, initialsFor } from '../utils/avatars';

/** Voting-state indicator ring around the avatar circle. */
export type AvatarRing = 'voted' | 'waiting';

const RING_CLASSES: Record<AvatarRing, string> = {
  voted: 'ring-2 ring-sage-500',
  waiting: 'ring-2 ring-ember-300',
};

const SIZES = {
  sm: { circle: 'w-6 h-6', text: 'text-sm', initials: 'text-xs' },
  md: { circle: 'w-12 h-12', text: 'text-2xl', initials: 'text-lg' },
} as const;

interface AvatarProps {
  id: string;
  name: string;
  avatar?: AvatarConfig | null;
  size?: keyof typeof SIZES;
  ring?: AvatarRing | null;
  /** When given, the avatar becomes a button that opens the customizer. */
  onClick?: () => void;
}

const Avatar = memo(({ id, name, avatar, size = 'sm', ring, onClick }: AvatarProps) => {
  const resolved = avatar ?? defaultAvatarFor(id);
  const { circle, text, initials } = SIZES[size];
  const className = `${circle} rounded-full flex items-center justify-center shrink-0 leading-none text-white ${
    ring ? RING_CLASSES[ring] : ''
  } ${onClick ? 'cursor-pointer transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400' : ''}`;

  const style = { backgroundColor: avatarColorHex[resolved.color] };

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onClick}
        title="Customize your avatar"
        aria-label="Customize your avatar"
      >
        <span className={resolved.glyph ? text : `${initials} font-bold`}>
          {resolved.glyph ?? initialsFor(name)}
        </span>
      </button>
    );
  }

  return (
    <div
      className={className}
      style={style}
      role="img"
      aria-label={resolved.glyph ? `${name}'s avatar — ${resolved.glyph}` : `${name}'s avatar`}
    >
      <span className={resolved.glyph ? text : `${initials} font-bold`}>
        {resolved.glyph ?? initialsFor(name)}
      </span>
    </div>
  );
});

export default Avatar;