// src/voice/entities/room.entity.ts
import { Room } from '../interfaces/room.interface';
import { Participant } from '../interfaces/participant.interface';
import { v4 as uuidv4 } from 'uuid';

export class RoomEntity implements Room {
  id: string;
  name: string;
  participants: Map<string, Participant>;
  maxParticipants: number;
  createdAt: Date;

  constructor(name: string, maxParticipants: number = 10) {
    this.id = uuidv4();
    this.name = name;
    this.participants = new Map<string, Participant>();
    this.maxParticipants = maxParticipants;
    this.createdAt = new Date();
  }

  addParticipant(participant: Participant): boolean {
    if (this.participants.size >= this.maxParticipant){}}