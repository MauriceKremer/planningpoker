import { render, screen } from '@testing-library/react';
import { resolveTheme, useActiveTheme, themes as realThemes } from '../themes';

const TestComponent = () => {
  const { theme, backdropStyle } = useActiveTheme();
  return (
    <div data-testid="theme">
      <span data-testid="theme-id">{theme?.id}</span>
      <span data-testid="backdrop">{backdropStyle.backgroundImage}</span>
    </div>
  );
};

const themes = [
  {
    id: 'christmas',
    start: '11-24',
    end: '01-06',
  },
  {
    id: 'autumn',
    start: '09-01',
    end: '11-23',
  },
  {
    id: 'summer',
    start: '05-01',
    end: '08-31',
  },
  {
    id: 'easter',
    start: '03-15',
    end: '04-06',
  },
  {
    id: 'spring',
    start: '03-15',
    end: '04-30',
  },
  {
    id: 'default',
  },
];

function date(month, day, year = 2024) {
  return new Date(year, month - 1, day);
}

describe('resolveTheme', () => {
  it('picks the first theme whose window contains the date', () => {
    expect(resolveTheme(themes, date(10, 15))).toEqual(themes.find((t) => t.id === 'autumn'));
    expect(resolveTheme(themes, date(7, 4))).toEqual(themes.find((t) => t.id === 'summer'));
  });

  it('respects array priority for overlapping windows', () => {
    // Easter and spring both cover late March; easter is listed first.
    expect(resolveTheme(themes, date(3, 20))).toEqual(themes.find((t) => t.id === 'easter'));
    // After easter ends, spring takes over.
    expect(resolveTheme(themes, date(4, 15))).toEqual(themes.find((t) => t.id === 'spring'));
  });

  it('handles wrap-around windows (start > end)', () => {
    expect(resolveTheme(themes, date(12, 25))).toEqual(themes.find((t) => t.id === 'christmas'));
    expect(resolveTheme(themes, date(1, 1))).toEqual(themes.find((t) => t.id === 'christmas'));
  });

  it('does not match a wrap-around window outside its range', () => {
    expect(resolveTheme(themes, date(11, 23))).toEqual(themes.find((t) => t.id === 'autumn'));
    expect(resolveTheme(themes, date(1, 7))).toEqual(themes.find((t) => t.id === 'default'));
  });

  it('falls back to the default theme when no window matches', () => {
    expect(resolveTheme(themes, date(2, 14))).toEqual(themes.find((t) => t.id === 'default'));
    expect(resolveTheme(themes, date(5, 1, 2023))).toEqual(themes.find((t) => t.id === 'summer'));
  });

  it('clamps Feb 29 to Feb 28 on non-leap years', () => {
    const winterTheme = {
      id: 'winter',
      start: '02-15',
      end: '02-29',
    };
    const withWinter = [winterTheme, { id: 'default' }];

    // 2023 is not a leap year; Feb 29 does not exist.
    expect(resolveTheme(withWinter, new Date(2023, 1, 28))).toEqual(winterTheme);
    expect(resolveTheme(withWinter, new Date(2023, 2, 1))).toEqual({ id: 'default' });

    // 2024 is a leap year; Feb 29 is inside the window.
    expect(resolveTheme(withWinter, new Date(2024, 1, 29))).toEqual(winterTheme);
    expect(resolveTheme(withWinter, new Date(2024, 2, 1))).toEqual({ id: 'default' });
  });

  it('treats window boundaries as inclusive', () => {
    expect(resolveTheme(themes, date(9, 1))).toEqual(themes.find((t) => t.id === 'autumn'));
    expect(resolveTheme(themes, date(11, 23))).toEqual(themes.find((t) => t.id === 'autumn'));
    expect(resolveTheme(themes, date(11, 24))).toEqual(themes.find((t) => t.id === 'christmas'));
  });
});

describe('useActiveTheme', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
    document.documentElement.removeAttribute('data-theme');
  });

  it('uses the date-based theme by default', () => {
    render(<TestComponent />);
    // Expected value derived from the same resolver + real themes.json so
    // this test stays valid in every season.
    const expected = resolveTheme(realThemes, new Date()).id;
    expect(screen.getByTestId('theme-id').textContent).toBe(expected);
    expect(document.documentElement.getAttribute('data-theme')).toBe(expected);
  });

  it('supports ?theme=<id> override for dev preview', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('theme', 'christmas');
    Object.defineProperty(window, 'location', {
      value: { search: url.search },
      writable: true,
    });

    render(<TestComponent />);
    expect(screen.getByTestId('theme-id').textContent).toBe('christmas');
    expect(screen.getByTestId('backdrop').textContent).toContain('backdrop_light_christmas');
    expect(document.documentElement.getAttribute('data-theme')).toBe('christmas');
  });

  it('falls back to date-based theme for unknown ?theme values', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('theme', 'unknown');
    Object.defineProperty(window, 'location', {
      value: { search: url.search },
      writable: true,
    });

    render(<TestComponent />);
    const expected = resolveTheme(realThemes, new Date()).id;
    expect(screen.getByTestId('theme-id').textContent).toBe(expected);
  });
});
