import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import AvatarPicker from '../AvatarPicker';

const user = {
  id: 'u-1',
  name: 'Alice',
  isModerator: true,
  isOnline: true,
  avatar: { color: 'teal', glyph: '🦊' },
};

const renderPicker = (onSave = vi.fn(), onClose = vi.fn()) => ({
  user,
  onSave,
  onClose,
  ...render(<AvatarPicker user={user} onClose={onClose} onSave={onSave} />),
});

describe('AvatarPicker', () => {
  test('renders the palette, sticker presets, initials option and free emoji input', () => {
    renderPicker();

    expect(screen.getByRole('dialog', { name: 'Customize your avatar' })).toBeInTheDocument();
    screen.getAllByRole('button', { name: /^Color: / }).forEach((button) => {
      expect(button).toHaveAttribute('aria-pressed');
    });
    expect(screen.getByRole('button', { name: 'Use initials' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Icon: 🦊' })).toBeInTheDocument();
  });

  test('picking a sticker and saving reports the color + glyph', async () => {
    const onSave = vi.fn();
    const { unmount } = renderPicker(onSave);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Icon: 🚀' }));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save avatar' }));

    expect(onSave).toHaveBeenCalledWith({ color: 'teal', glyph: '🚀' });
    unmount();
  });

  test('choosing initials reports a color-only config', async () => {
    const onSave = vi.fn();
    renderPicker(onSave);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Use initials' }));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save avatar' }));

    expect(onSave).toHaveBeenCalledWith({ color: 'teal' });
  });

  test('Escape closes the dialog without saving', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    renderPicker(onSave, onClose);

    await userEvent.setup().type(screen.getByRole('dialog'), '{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});