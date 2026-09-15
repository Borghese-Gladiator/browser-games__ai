// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Lobby } from './Lobby.tsx';
import type { RoomSummary } from './protocol.ts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const ROOMS: RoomSummary[] = [
  { code: 'ABCD', players: 2, max: 4, locked: false, host: 'Grace' },
  { code: 'WXYZ', players: 4, max: 4, locked: true, host: null },
];

function renderLobby(overrides: Partial<Parameters<typeof Lobby>[0]> = {}) {
  const props = {
    title: 'Mahjong',
    rooms: ROOMS,
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    onQuickMatch: vi.fn(),
    onSpectate: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<Lobby {...props} />);
  return props;
}

// The E2E helpers drive the lobby by these four accessible names. Renaming one
// breaks every multiplayer spec, so pin them here where it is cheap to see.
describe('Lobby', () => {
  it('exposes the accessible names the E2E helpers drive', () => {
    renderLobby();
    expect(screen.getByLabelText('Your name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create room' })).toBeTruthy();
    expect(screen.getByLabelText('Room code')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join by code' })).toBeTruthy();
  });

  it('gates every seat-taking action until a name is entered', () => {
    renderLobby();
    expect(screen.getByRole('button', { name: 'Play now' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Create room' })).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });

    expect(screen.getByRole('button', { name: 'Play now' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Create room' })).toHaveProperty('disabled', false);
  });

  it('quick-matches and creates with the trimmed name', () => {
    const props = renderLobby();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Ada  ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Play now' }));
    expect(props.onQuickMatch).toHaveBeenCalledWith('Ada');

    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));
    expect(props.onCreate).toHaveBeenCalledWith('Ada');
  });

  it('upper-cases a typed room code on join', () => {
    const props = renderLobby();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join by code' }));
    expect(props.onJoin).toHaveBeenCalledWith('ABCD', 'Ada');
  });

  it('joins a listed table by its row, and counts only the joinable ones', () => {
    const props = renderLobby();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });

    // WXYZ is full and locked, so one table is open.
    expect(screen.getByText('1 open')).toBeTruthy();
    expect(screen.getByText('hosted by Grace')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /ABCD/ }));
    expect(props.onJoin).toHaveBeenCalledWith('ABCD', 'Ada');
  });

  it('shows an empty-state instead of a table list when nothing is hosted', () => {
    renderLobby({ rooms: [] });
    expect(screen.queryByRole('button', { name: /ABCD/ })).toBeNull();
    expect(screen.getByText(/No tables yet/)).toBeTruthy();
  });

  it('renders a server error as an alert', () => {
    renderLobby({ error: 'Room is full' });
    expect(screen.getByRole('alert').textContent).toBe('Room is full');
  });
});
