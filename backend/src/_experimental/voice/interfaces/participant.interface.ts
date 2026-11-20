// src/voice/interfaces/participant.interface.ts
export interface Participant {
    id: string;          // Unique ID for the participant
    socketId: string;    // Socket connection ID
    username: string;    // Display name
    muted: boolean;      // Whether the participant is muted
    roomId: string;      // ID of the room they're in
    qualityPreference: 'low' | 'medium' | 'high';  // Audio quality setting
    isRecording: boolean; // Whether participant is recording
  }
  