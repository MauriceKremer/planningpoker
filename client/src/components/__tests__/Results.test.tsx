import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Results from '../Results';

describe('Results', () => {
  const renderResults = () =>
    render(<Results votes={{ 'u-1': '5', 'u-2': '8', 'u-3': '5' }} cardSet={['1', '5', '8']} />);

  test('distribution rows rise in with a stagger', () => {
    renderResults();
    const row = screen.getByText('Vote Distribution').nextElementSibling!;
    expect(row.children[0]).toHaveClass('animate-rise-in');
    expect(row.children[0]).toHaveStyle({ animationDelay: '0ms' });
    expect(row.children[1]).toHaveStyle({ animationDelay: '45ms' });
  });

  test('bars grow from the left edge on reveal', () => {
    renderResults();
    const bars = document.querySelectorAll('.animate-grow-x');
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]).toHaveClass('origin-left');
    expect(bars[0]).toHaveStyle({ animationDelay: '0ms' });
  });
});