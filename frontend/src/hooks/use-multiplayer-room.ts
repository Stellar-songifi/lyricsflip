'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  RoomData,
  ServerToClientEvents,
} from '@/types/realtime';

export type { Player, RoomData } from '@/types/realtime';

export interface UseMultiplayerRoomProps {
  roomId: string;
  playerName: string;
  /** Auth token sent in the Socket.IO handshake (LF-093). */
  token?: string | null;
}

// Define WebSocket message event type
interface WebSocketMessageEvent {
  data: string;
}

// Mock data for demonstration
const mockRoomData: RoomData = {
  id: '',
  name: 'Wager (Multi Player)',
  description:
    'Create a round, invite friends, and compete head-to-head. Winner takes the pot.',
  timeLeft: '59:00',
  potWin: '10,000 STRK',
  scores: 456,
  players: [
    { id: 'player1', name: 'Player 1', score: 120 },
    { id: 'player2', name: 'Player 2', score: 85 },
    { id: 'player3', name: 'Player 3', score: 251 },
  ],
  currentLyric: {
    text: '"All I know is that when I dey cock, I hit and go\nAll I know is that when I been shoot, I hit their own"',
    title: 'Sungba Remix',
    artist: 'Asake ft. Burna Boy',
  },
  songOptions: [
    { title: 'Pakurumo', artist: 'Wizkid & Samklef' },
    { title: "Don't Let Me Down", artist: 'Chainsmokers' },
    {
      title: 'Blood on The Dance Floor',
      artist: 'ODUMODU BLVCK Bloody Civilian & Wale',
    },
    { title: "God's Plan", artist: 'Drake' },
  ],
};

// Mock WebSocket class for demonstration
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: WebSocketMessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  readyState = 1; // WebSocket.OPEN
type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

export function useMultiplayerRoom({
  roomId,
  playerName,
  token,
}: UseMultiplayerRoomProps) {
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const socket: RoomSocket = io(WS_URL, {
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    const update = (fn: (prev: RoomData) => RoomData) =>
      setRoomData((prev) => (prev ? fn(prev) : prev));

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('Failed to connect to the game server');
    };

    // Store the WebSocket instance in the ref
    socketRef.current = ws;

    // For testing, directly set mock data after a short delay
    // This ensures we have data even if the WebSocket fails
    const fallbackTimer = setTimeout(() => {
      if (!roomData) {
        setIsConnected(true);
        setRoomData({ ...mockRoomData, id: roomId });
      }
    }, 2000);
    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      // Re-join on every (re)connect so the server restores room membership.
      socket.emit('join_room', { roomId, playerName });
    });
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () =>
      setError('Failed to connect to the game server'),
    );

    socket.on('room_data', (payload) => setRoomData(payload));
    socket.on('player_joined', (player) =>
      update((prev) => ({
        ...prev,
        players: [...prev.players.filter((p) => p.id !== player.id), player],
      })),
    );
    socket.on('player_left', ({ playerId }) =>
      update((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
      })),
    );
    socket.on('score_update', ({ playerId, score, totalScore }) =>
      update((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.id === playerId ? { ...p, score } : p,
        ),
        scores: totalScore,
      })),
    );
    socket.on('time_update', ({ timeLeft }) =>
      update((prev) => ({ ...prev, timeLeft })),
    );
    socket.on('new_lyric', ({ lyric, songOptions }) =>
      update((prev) => ({ ...prev, currentLyric: lyric, songOptions })),
    );
    socket.on('room_error', ({ message }) => setError(message));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, playerName, token]);

  const selectSong = useCallback(
    (songIndex: number) => {
      socketRef.current?.emit('select_song', { roomId, songIndex });
    },
    [roomId],
  );

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('leave_room', { roomId });
    socket.disconnect();
    socketRef.current = null;
  }, [roomId]);

  return {
    roomData,
    isConnected,
    error,
    selectSong,
    leaveRoom,
  };
}
