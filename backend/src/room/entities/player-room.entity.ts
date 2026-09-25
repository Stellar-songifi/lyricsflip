import { Entity, Column, ManyToOne, PrimaryGeneratedColumn, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Player } from '../../player/player.entity';
import { Room } from './room.entity';

@Entity('player_rooms')
export class PlayerRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  playerId: string;

  @Column()
  roomId: string;

  @ManyToOne(() => Player, player => player.playerRooms)
  @JoinColumn({ name: 'playerId' })
  player: Player;

  @ManyToOne(() => Room, room => room.playerRooms)
  @JoinColumn({ name: 'roomId' })
  room: Room;

  @Column({ default: false })
  isActive: boolean;

  @CreateDateColumn()
  joinedAt: Date;

  @Column({ nullable: true })
  leftAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
