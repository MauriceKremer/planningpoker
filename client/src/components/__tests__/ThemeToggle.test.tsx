import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ThemeToggle from '../ThemeToggle';

const MODE_LABELS = ['Playful theme', 'Clean theme', 'Clean dark theme'];

describe('ThemeToggle', () => {
  test('renders one option per theme mode in a labelled group', () => {
    render(<ThemeToggle mode="clean-dark" onModeChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    for (const label of MODE_LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Clean dark theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Clean theme' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('activating an option reports its mode and reflects the pressed state', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(<ThemeToggle mode="playful" onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button', { name: 'Clean theme' }));

    expect(onModeChange).toHaveBeenCalledWith('clean');
  });
});