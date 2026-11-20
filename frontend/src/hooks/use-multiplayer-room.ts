'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { env } from '@/env';
import type {
  ClientToServerEvents,
  Player,
  PlayerJoinedPayload,
  RoomData,
  RoomState,
  ServerToClientEvents,
  QuestionCard,
  RoundCompletedPayload,
} from '@/types/realtime';

export type { Player, RoomData, RoomState, QuestionCard } from '@/types/realtime';

export interface UseMultiplayerRoomProps {
  roomId: string;
  playerName: string;
  playerId?: string;
  /** Auth token sent in the Socket.IO handshake (LF-093). */
  token?: string | null;
}

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const WS_URL = env.NEXT_PUBLIC_WS_URL;

export function useMultiplayerRoom({
  roomId,
  playerName,
  playerId,
  token,
}: UseMultiplayerRoomProps) {
  const [roomData, setRoomData] = useState<RoomState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundCompleted, setRoundCompleted] = useState<RoundCompletedPayload | null>(null);
  const socketRef = useRef<RoomSocket | null>(null);

  const effectivePlayerId = playerId || playerName;

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

    const update = (fn: (prev: RoomState) => RoomState) =>
      setRoomData((prev) => (prev ? fn(prev) : prev));

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      // Re-join on every (re)connect so the server restores room membership.
      socket.emit('room:join', {
        roomId,
        playerId: effectivePlayerId,
        username: playerName,
      });
      socket.emit('join_room', { roomId, playerName });
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () =>
      setError('Failed to connect to the game server'),
    );

    // Spec server events
    socket.on('room:state', (state) => setRoomData(state));
    socket.on('player:joined', (payload: PlayerJoinedPayload) => {
      const pId = payload.playerId || payload.id || '';
      const uName = payload.username || payload.name || pId;
      const newPlayer: Player = {
        playerId: pId,
        username: uName,
        id: pId,
        name: uName,
        score: payload.score ?? 0,
        isReady: false,
        joinedAt: payload.timestamp || new Date().toISOString(),
      };
      update((prev) => ({
        ...prev,
        players: [
          ...prev.players.filter((p) => (p.playerId || p.id) !== pId),
          newPlayer,
        ],
      }));
    });

    socket.on('player:left', (payload) => {
      const pId = payload.playerId;
      update((prev) => ({
        ...prev,
        players: prev.players.filter((p) => (p.playerId || p.id) !== pId),
      }));
    });

    socket.on('player:ready', ({ playerId: readyPlayerId }) => {
      update((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          (p.playerId || p.id) === readyPlayerId ? { ...p, isReady: true } : p,
        ),
      }));
    });

    socket.on('card:next', ({ question }) => {
      update((prev) => ({
        ...prev,
        currentCard: question,
        currentLyric: { text: question.lyrics },
        songOptions: question.options.map((opt) => ({
          title: opt,
          artist: '',
        })),
      }));
    });

    socket.on('timer:tick', ({ remainingMs }) => {
      const seconds = Math.max(0, Math.floor(remainingMs / 1000));
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      update((prev) => ({ ...prev, timeLeft: formatted }));
    });

    socket.on('score:update', ({ playerId: sPlayerId, score, totalScore }) => {
      const resolvedScore = score ?? totalScore ?? 0;
      update((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          (p.playerId || p.id) === sPlayerId
            ? { ...p, score: resolvedScore }
            : p,
        ),
        scores: totalScore ?? resolvedScore,
      }));
    });

    socket.on('round:completed', (payload) => {
      setRoundCompleted(payload);
      update((prev) => ({ ...prev, status: 'completed' }));
    });

    socket.on('error', (err) => {
      setError(typeof err === 'string' ? err : err.message);
    });

    // Legacy listeners for backwards compatibility
    socket.on('room_data', (payload) => setRoomData(payload));
    socket.on('player_joined', (payload) => {
      const pId = payload.id || payload.playerId || '';
      const uName = payload.name || payload.username || pId;
      const newPlayer: Player = {
        playerId: pId,
        username: uName,
        id: pId,
        name: uName,
        score: payload.score ?? 0,
        isReady: false,
        joinedAt: new Date().toISOString(),
      };
      update((prev) => ({
        ...prev,
        players: [
          ...prev.players.filter((p) => (p.playerId || p.id) !== pId),
          newPlayer,
        ],
      }));
    });
    socket.on('player_left', ({ playerId: lPlayerId }) => {
      update((prev) => ({
        ...prev,
        players: prev.players.filter((p) => (p.playerId || p.id) !== lPlayerId),
      }));
    });
    socket.on('score_update', ({ playerId: scPlayerId, score, totalScore }) => {
      update((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          (p.playerId || p.id) === scPlayerId ? { ...p, score } : p,
        ),
        scores: totalScore,
      }));
    });
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
  }, [roomId, playerName, effectivePlayerId, token]);

  const ready = useCallback(() => {
    socketRef.current?.emit('room:ready', { roomId });
  }, [roomId]);

  const submitAnswer = useCallback(
    (answer: string, roundIndex?: number) => {
      socketRef.current?.emit('answer:submitted', {
        roomId,
        answer,
        roundIndex,
      });
    },
    [roomId],
  );

  const selectSong = useCallback(
    (songIndex: number) => {
      socketRef.current?.emit('answer:submitted', {
        roomId,
        answer: String(songIndex),
      });
      socketRef.current?.emit('select_song', { roomId, songIndex });
    },
    [roomId],
  );

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('room:leave', { roomId });
    socket.emit('leave_room', { roomId });
    socket.disconnect();
    socketRef.current = null;
  }, [roomId]);

  return {
    roomData,
    roomState: roomData,
    isConnected,
    error,
    roundCompleted,
    ready,
    submitAnswer,
    selectSong,
    leaveRoom,
  };
}
