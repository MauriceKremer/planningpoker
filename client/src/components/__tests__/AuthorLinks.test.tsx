import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AuthorLinks from '../AuthorLinks';

describe('AuthorLinks', () => {
  test('links to the author profile with safe external-link attributes', () => {
    render(<AuthorLinks />);

    const linkedin = screen.getByRole('link', { name: /Maurice Kremer on LinkedIn/i });
    const github = screen.getByRole('link', { name: /Maurice Kremer on GitHub/i });

    expect(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/in/mauricekremer/');
    expect(linkedin).toHaveAttribute('target', '_blank');
    expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer');

    expect(github).toHaveAttribute('href', 'https://github.com/MauriceKremer');
    expect(github).toHaveAttribute('target', '_blank');
    expect(github).toHaveAttribute('rel', 'noopener noreferrer');
  });
});