// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LockRoomButton } from './LockRoomButton.tsx';

afterEach(cleanup);

describe('LockRoomButton', () => {
  it('offers to lock an open room and reports the state', () => {
    const onToggle = vi.fn();
    render(<LockRoomButton locked={false} onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: 'Lock room' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('offers to unlock a locked room', () => {
    const onToggle = vi.fn();
    render(<LockRoomButton locked onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: 'Unlock room' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('treats an absent lock state as unlocked', () => {
    // A state frame from a server that predates the locked field.
    render(<LockRoomButton onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Lock room' })).toBeTruthy();
  });
});
