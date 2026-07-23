// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Portal } from './Portal.jsx';

afterEach(cleanup);

describe('Portal', () => {
  it('renders the footer', () => {
    render(<Portal />);
    expect(screen.getByText('Made with Claude')).toBeTruthy();
  });
});
