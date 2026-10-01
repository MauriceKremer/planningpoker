import type { ReactNode } from 'react';
import type { ThemeMode } from '../utils/themePreference';

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 3l2 5.1L19 10l-5 1.9L12 17l-2-5.1L5 10l5-1.9L12 3Z" />
    <path d="M18.8 13.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
  </svg>
);

const MODES: ReadonlyArray<{ value: ThemeMode; label: string; icon: ReactNode }> = [
  { value: 'playful', label: 'Playful', icon: <SparklesIcon /> },
  { value: 'clean', label: 'Clean', icon: <SunIcon /> },
  { value: 'clean-dark', label: 'Clean dark', icon: <MoonIcon /> },
];

interface ThemeToggleProps {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}

const ThemeToggle = ({ mode, onModeChange }: ThemeToggleProps) => (
  <div role="group" aria-label="Theme" className="theme-toggle flex items-center rounded-lg px-0.5">
    {MODES.map(({ value, label, icon }) => (
      <button
        key={value}
        type="button"
        onClick={() => onModeChange(value)}
        aria-pressed={mode === value}
        title={`${label} theme`}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
          mode === value ? 'bg-ember-500 text-white' : 'text-cream-100 hover:text-ember-300'
        }`}
      >
        {icon}
        <span className="sr-only">{label} theme</span>
      </button>
    ))}
  </div>
);

export default ThemeToggle;