// src/geolocation/entities/location-access.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { LocationEntity } from './location.entity';

@Entity('location_access')
export class LocationAccessEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => LocationEntity)
  @JoinColumn()
  location: LocationEntity;

  @Column()
  @Index()
  ipAddress: string;

  @Column()
  endpoint: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ default: false })
  isBlocked: boolean;

  @Column({ nullable: true })
  blockReason: string;

  @CreateDateColumn()
  @Index()
  accessTime: Date;
}
