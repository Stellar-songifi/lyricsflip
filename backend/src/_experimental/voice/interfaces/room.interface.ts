// src/voice/interfaces/room.interface.ts
import { Participant } from './participant.interface';

export interface Room {
  id: string;                             // Unique room ID
  name: string;                           // Room display name
  participants: Map<string, Participant>; // Map of participants by ID
  maxParticipants: number;                // Max number of allowed participants
  createdAt: Date;                        // Room creation timestamp
}