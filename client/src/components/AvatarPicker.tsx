import { useEffect, useRef, useState } from 'react';
import type { SessionUser } from '../protocol/session';
import { avatarSchema, AVATAR_COLORS } from '../protocol/events';
import type { Avatar as AvatarConfig } from '../protocol/events';
import Avatar from './Avatar';
import { avatarColorHex, defaultAvatarFor, initialsFor, STICKERS } from '../utils/avatars';
import type { AvatarColor } from '../utils/avatars';

interface AvatarPickerProps {
  user: SessionUser;
  onClose: () => void;
  onSave: (avatar: AvatarConfig) => void;
}

const AvatarPicker = ({ user, onClose, onSave }: AvatarPickerProps) => {
  const draft = user.avatar ?? defaultAvatarFor(user.id);
  const [color, setColor] = useState<AvatarColor>(draft.color);
  const [glyph, setGlyph] = useState<string>(draft.glyph ?? '');
  const dialogRef = useRef<HTMLDivElement>(null);

  // ESC closes; Tab stays inside the dialog (a lightweight focus cycle).
  useEffect(() => {
    dialogRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSave = () => {
    const result = avatarSchema.safeParse(glyph ? { color, glyph } : { color });
    if (!result.success) return;
    onSave(result.data);
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-mocha-900/40 flex items-center justify-center p-4 app-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Customize your avatar"
        tabIndex={-1}
        className="card-lg p-5 w-full max-w-xs max-h-[90vh] overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-400"
      >
        <div className="flex items-center gap-3">
          <Avatar id={user.id} name={user.name} size="md" avatar={{ color, ...(glyph ? { glyph } : {}) }} />
          <div>
            <h2 className="text-base font-semibold text-mocha-800">Customize Avatar</h2>
            <p className="text-xs text-mocha-500">
              {glyph ? `${glyph} as ${user.name}` : `${initialsFor(user.name)} as ${user.name}`}
            </p>
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-mocha-700 mb-1.5">Background</legend>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((palette) => (
              <button
                key={palette}
                type="button"
                className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                  palette === color ? 'ring-2 ring-ember-500 ring-offset-1 ring-offset-cream-50' : ''
                }`}
                style={{ backgroundColor: avatarColorHex[palette] }}
                onClick={() => setColor(palette)}
                title={`Color: ${palette}`}
                aria-label={`Color: ${palette}`}
                aria-pressed={palette === color}
              />
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <p className="text-xs font-medium text-mocha-700 mb-1.5" id="avatar-stickers-label">Icon</p>
          <div className="flex flex-wrap gap-1" aria-labelledby="avatar-stickers-label">
            <button
              type="button"
              className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border ${
                glyph === ''
                  ? 'bg-ember-100 border-ember-300 ring-2 ring-ember-400' : 'bg-cream-100/80 border-cream-300 hover:bg-cream-200'
              }`}
              onClick={() => setGlyph('')}
              title="Use initials"
              aria-label="Use initials"
              aria-pressed={glyph === ''}
            >
              {initialsFor(user.name)}
            </button>
            {STICKERS.map((sticker) => (
              <button
                key={sticker}
                type="button"
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border ${
                  glyph === sticker
                    ? 'bg-ember-100 border-ember-300 ring-2 ring-ember-400' : 'bg-cream-100/80 border-cream-300 hover:bg-cream-200'
                }`}
                onClick={() => setGlyph(sticker)}
                title={`Icon: ${sticker}`}
                aria-label={`Icon: ${sticker}`}
                aria-pressed={glyph === sticker}
              >
                {sticker}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn btn-quiet px-3 py-1.5 text-xs min-h-[44px]">
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-primary px-3 py-1.5 text-xs min-h-[44px]">
            Save avatar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarPicker;