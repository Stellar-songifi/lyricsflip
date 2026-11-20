import { act, renderHook } from '@testing-library/react';
import { io } from 'socket.io-client';
import { useMultiplayerRoom } from '../hooks/use-multiplayer-room';
import type { RoomState } from '../types/realtime';

type Handler = (payload?: unknown) => void;

const handlers: Record<string, Handler> = {};
const mockSocket: Record<string, jest.Mock> = {
  on: jest.fn((event: string, handler: Handler) => {
    handlers[event] = handler;
  }),
  emit: jest.fn(),
  disconnect: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock('socket.io-client', () => ({ io: jest.fn(() => mockSocket) }));

const room: RoomState = {
  roomId: 'r1',
  status: 'waiting',
  currentRoundIndex: 0,
  maxRounds: 5,
  createdAt: '2026-10-20T10:00:00.000Z',
  id: 'r1',
  name: 'Room',
  description: '',
  timeLeft: '01:00',
  potWin: '0',
  scores: 0,
  players: [{ playerId: 'p1', username: 'Alice', isReady: false, score: 0, joinedAt: '', id: 'p1', name: 'Alice' }],
  currentLyric: { text: 'lyric' },
  songOptions: [],
};

const fire = (event: string, payload?: unknown) =>
  act(() => handlers[event](payload));

describe('useMultiplayerRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(handlers).forEach((k) => delete handlers[k]);
  });

  const setup = () => {
    const hook = renderHook(() =>
      useMultiplayerRoom({ roomId: 'r1', playerName: 'Alice', token: 'jwt' }),
    );
    fire('connect');
    fire('room:state', room);
    return hook;
  };

  it('connects with auth and emits room:join and legacy join_room on connect', () => {
    const { result } = setup();
    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: { token: 'jwt' }, reconnection: true }),
    );
    expect(mockSocket.emit).toHaveBeenCalledWith('room:join', {
      roomId: 'r1',
      playerId: 'Alice',
      username: 'Alice',
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', {
      roomId: 'r1',
      playerName: 'Alice',
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.roomData).toEqual(room);
  });

  it('handles spec player:joined, player:ready and player:left', () => {
    const { result } = setup();
    fire('player:joined', {
      playerId: 'p2',
      username: 'Bob',
      playerCount: 2,
      timestamp: '2026-10-20T10:01:00.000Z',
    });
    expect(result.current.roomData?.players.map((p) => p.playerId)).toEqual([
      'p1',
      'p2',
    ]);

    fire('player:ready', { playerId: 'p2', readyCount: 1, totalPlayers: 2 });
    expect(result.current.roomData?.players.find((p) => p.playerId === 'p2')?.isReady).toBe(true);

    fire('player:left', { playerId: 'p1', username: 'Alice', playerCount: 1, timestamp: '2026-10-20T10:02:00.000Z' });
    expect(result.current.roomData?.players.map((p) => p.playerId)).toEqual(['p2']);
  });

  it('handles spec card:next and timer:tick', () => {
    const { result } = setup();
    fire('card:next', {
      roundIndex: 1,
      question: {
        id: 'q1',
        lyrics: 'Is this the real life?',
        options: ['Bohemian Rhapsody', 'Killer Queen'],
        timeLimit: 15000,
      },
      timestamp: '2026-10-20T10:01:00.000Z',
    });
    expect(result.current.roomData?.currentCard?.id).toBe('q1');
    expect(result.current.roomData?.currentLyric?.text).toBe('Is this the real life?');

    fire('timer:tick', { roundIndex: 1, remainingMs: 45000, timestamp: '2026-10-20T10:01:10.000Z' });
    expect(result.current.roomData?.timeLeft).toBe('00:45');
  });

  it('handles spec score:update and round:completed', () => {
    const { result } = setup();
    fire('score:update', { playerId: 'p1', score: 10, pointsGained: 10, timestamp: '2026-10-20T10:01:20.000Z' });
    expect(result.current.roomData?.players[0].score).toBe(10);

    const completedPayload = {
      roundIndex: 1,
      correctAnswer: 'Bohemian Rhapsody',
      playerResults: [{ playerId: 'p1', answer: 'Bohemian Rhapsody', isCorrect: true, pointsEarned: 10 }],
      timestamp: '2026-10-20T10:02:00.000Z',
    };
    fire('round:completed', completedPayload);
    expect(result.current.roundCompleted).toEqual(completedPayload);
    expect(result.current.roomData?.status).toBe('completed');
  });

  it('handles error, connect_error and disconnect', () => {
    const { result } = setup();
    fire('error', { code: 'ROOM_FULL', message: 'Room full' });
    expect(result.current.error).toBe('Room full');
    fire('disconnect');
    expect(result.current.isConnected).toBe(false);
    fire('connect_error');
    expect(result.current.error).toBe('Failed to connect to the game server');
  });

  it('emits room:ready, answer:submitted and room:leave', () => {
    const { result } = setup();
    act(() => result.current.ready());
    expect(mockSocket.emit).toHaveBeenCalledWith('room:ready', { roomId: 'r1' });

    act(() => result.current.submitAnswer('Bohemian Rhapsody', 1));
    expect(mockSocket.emit).toHaveBeenCalledWith('answer:submitted', {
      roomId: 'r1',
      answer: 'Bohemian Rhapsody',
      roundIndex: 1,
    });

    act(() => result.current.selectSong(2));
    expect(mockSocket.emit).toHaveBeenCalledWith('answer:submitted', {
      roomId: 'r1',
      answer: '2',
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('select_song', {
      roomId: 'r1',
      songIndex: 2,
    });

    act(() => result.current.leaveRoom());
    expect(mockSocket.emit).toHaveBeenCalledWith('room:leave', { roomId: 'r1' });
    expect(mockSocket.emit).toHaveBeenCalledWith('leave_room', { roomId: 'r1' });
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
