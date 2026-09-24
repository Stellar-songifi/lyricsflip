'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGameTimer } from '@/features/game/hooks/useGameTimer';

// Define types for our room data
export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface RoomData {
  id: string;
  name: string;
  description: string;
  timeLeft: string;
  potWin: string;
  scores: number;
  players: Player[];
  currentLyric: {
    text: string;
    title?: string;
    artist?: string;
  };
  songOptions: {
    title: string;
    artist: string;
  }[];
}

export interface UseMultiplayerRoomProps {
  roomId: string;
  playerName: string;
}

// Define WebSocket message event type
interface WebSocketMessageEvent {
  data: string;
}

// Mock data for demonstration
const mockRoomData: RoomData = {
  id: 'sample-room-id',
  name: 'Wager (Multi Player)',
  description:
    'High-stakes multiplayer room — outscore your rivals to claim the STRK pot.',
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

  constructor(url: string) {
    console.log('MockWebSocket created');
    // Simulate connection open immediately
    setTimeout(() => {
      console.log('MockWebSocket onopen firing');
      if (this.onopen) this.onopen();

      // Send initial room data immediately
      console.log('MockWebSocket sending room data');
      if (this.onmessage) {
        this.onmessage({
          data: JSON.stringify({
            type: 'ROOM_DATA',
            payload: mockRoomData,
          }),
        });
      }
    }, 100); // Reduced delay to 100ms
  }

  send(data: string) {
    console.log('MockWebSocket send:', data);
    const parsedData = JSON.parse(data);

    // Handle different message types
    switch (parsedData.type) {
      case 'SELECT_SONG':
        // Simulate selecting a song
        setTimeout(() => {
          if (this.onmessage) {
            // Update scores
            const updatedScores = mockRoomData.scores + 10;
            this.onmessage({
              data: JSON.stringify({
                type: 'SCORE_UPDATE',
                payload: {
                  playerId: 'player1',
                  score: 130,
                  totalScore: updatedScores,
                },
              }),
            });

            // Send new lyric after selection
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage({
                  data: JSON.stringify({
                    type: 'NEW_LYRIC',
                    payload: {
                      lyric: {
                        text: '"New lyric after selection"',
                        title: 'New Song',
                        artist: 'New Artist',
                      },
                      songOptions: mockRoomData.songOptions,
                    },
                  }),
                });
              }
            }, 500);
          }
        }, 300);
        break;

      case 'LEAVE_ROOM':
        // Do nothing for now
        break;
    }
  }

  close() {
    if (this.onclose) this.onclose();
  }
}

export function useMultiplayerRoom({
  roomId,
  playerName,
}: UseMultiplayerRoomProps) {
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always use mock WebSocket for now to ensure it works
  const [useMockWebSocket] = useState(true);

  // Use a ref for the socket to avoid re-renders when it changes
  const socketRef = useRef<WebSocket | MockWebSocket | null>(null);

  // Connect to the WebSocket server
  useEffect(() => {
    console.log('Setting up WebSocket connection');

    // Create a mock WebSocket
    const ws = new MockWebSocket(`mock://rooms/${roomId}`);

    ws.onopen = () => {
      console.log('WebSocket connection opened');
      setIsConnected(true);
    };

    ws.onmessage = (event: WebSocketMessageEvent) => {
      console.log('WebSocket message received:', event.data);
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'ROOM_DATA':
            console.log('Setting room data:', data.payload);
            setRoomData(data.payload);
            break;
          case 'PLAYER_JOINED':
            setRoomData((prevData) => {
              if (!prevData) return prevData;
              return {
                ...prevData,
                players: [...prevData.players, data.payload],
              };
            });
            break;
          case 'PLAYER_LEFT':
            setRoomData((prevData) => {
              if (!prevData) return prevData;
              return {
                ...prevData,
                players: prevData.players.filter(
                  (player) => player.id !== data.payload.playerId,
                ),
              };
            });
            break;
          case 'SCORE_UPDATE':
            setRoomData((prevData) => {
              if (!prevData) return prevData;
              return {
                ...prevData,
                players: prevData.players.map((player) =>
                  player.id === data.payload.playerId
                    ? { ...player, score: data.payload.score }
                    : player,
                ),
                scores: data.payload.totalScore,
              };
            });
            break;
          case 'TIME_UPDATE':
            setRoomData((prevData) => {
              if (!prevData) return prevData;
              return {
                ...prevData,
                timeLeft: data.payload.timeLeft,
              };
            });
            break;
          case 'NEW_LYRIC':
            setRoomData((prevData) => {
              if (!prevData) return prevData;
              return {
                ...prevData,
                currentLyric: data.payload.lyric,
                songOptions: data.payload.songOptions,
              };
            });
            break;
          case 'ERROR':
            setError(data.payload.message);
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
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
        console.log('Fallback: Setting mock room data directly');
        setIsConnected(true);
        setRoomData(mockRoomData);
      }
    }, 2000);

    // Cleanup function
    return () => {
      clearTimeout(fallbackTimer);
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (err) {
          console.error('Error closing WebSocket:', err);
        }
      }
    };
  }, [roomId, playerName]); // Removed useMockWebSocket from dependencies

  // Function to select a song
  const selectSong = useCallback(
    (songIndex: number) => {
      const socket = socketRef.current;
      if (socket && isConnected) {
        try {
          socket.send(
            JSON.stringify({
              type: 'SELECT_SONG',
              payload: {
                roomId,
                songIndex,
              },
            }),
          );
        } catch (err) {
          console.error('Error sending song selection:', err);
        }
      }
    },
    [isConnected, roomId],
  );

  // Function to leave the room
  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (socket && isConnected) {
      try {
        socket.send(
          JSON.stringify({
            type: 'LEAVE_ROOM',
            payload: {
              roomId,
            },
          }),
        );
        socket.close();
      } catch (err) {
        console.error('Error leaving room:', err);
      }
      socketRef.current = null;
    }
  }, [isConnected, roomId]);

  return {
    roomData,
    isConnected,
    error,
    selectSong,
    leaveRoom,
  };
}
