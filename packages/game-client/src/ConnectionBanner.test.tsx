// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConnectionBanner } from './ConnectionBanner.tsx';

afterEach(cleanup);

describe('ConnectionBanner', () => {
  it('renders nothing when connected', () => {
    const { container } = render(<ConnectionBanner connectionStatus="connected" />);
    expect(container.innerHTML).toBe('');
  });

  it('announces a reconnecting alert', () => {
    render(<ConnectionBanner connectionStatus="reconnecting" />);
    expect(screen.getByRole('alert').textContent).toMatch(/reconnecting/i);
  });

  it('announces a disconnected alert with refresh guidance', () => {
    render(<ConnectionBanner connectionStatus="disconnected" />);
    expect(screen.getByRole('alert').textContent).toMatch(/refresh/i);
  });
});
