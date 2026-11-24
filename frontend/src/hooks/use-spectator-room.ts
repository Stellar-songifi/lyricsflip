'use client';

import { useState, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  Player,
  RoomData,
  ServerToClientEvents,
} from '@/types/realtime';

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

export interface SpectatorState {
  /** Live scoreboard. */
  scores: Player[];
  /** Number of cards answered so far in the round. */
  cardsAnswered: number;
  /** True once the server emits round_ended. */
  isFinalized: boolean;
  /** Final scoreboard populated on round_ended (never shown before). */
  finalScores: Player[] | null;
  timeLeft: string;
  isConnected: boolean;
  error: string | null;
}

/**
 * Connects to the realtime gateway as a read-only spectator.
 * Subscribes to live score updates and the final reveal without ever
 * sending answers or exposing song options.
 */
export function useSpectatorRoom(roomId: string): SpectatorState {
  const [scores, setScores] = useState<Player[]>([]);
  const [cardsAnswered, setCardsAnswered] = useState(0);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalScores, setFinalScores] = useState<Player[] | null>(null);
  const [timeLeft, setTimeLeft] = useState('--:--');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const socket: RoomSocket = io(WS_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      socket.emit('watch_room', { roomId });
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () =>
      setError('Failed to connect to the game server'),
    );

    // Seed initial room state.
    socket.on('room_data', (payload: RoomData) => {
      setScores(payload.players);
      setTimeLeft(payload.timeLeft);
    });

    // Live score updates.
    socket.on('score_update', ({ playerId, score }) => {
      setScores((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, score } : p)),
      );
    });

    // Track how many cards have been answered (player_answered fires per answer).
    socket.on('player_answered', () => {
      setCardsAnswered((n) => n + 1);
    });

    socket.on('time_update', ({ timeLeft: t }) => setTimeLeft(t));

    // Final reveal – only set after round_ended.
    socket.on('round_ended', ({ scores: finalScoresPayload }) => {
      setIsFinalized(true);
      setFinalScores(
        [...finalScoresPayload].sort((a, b) => b.score - a.score),
      );
    });

    socket.on('room_error', ({ message }) => setError(message));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  return {
    scores,
    cardsAnswered,
    isFinalized,
    finalScores,
    timeLeft,
    isConnected,
    error,
  };
}
