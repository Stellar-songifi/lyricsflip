import { ApiProperty } from '@nestjs/swagger';

export class ExportNotificationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ nullable: true })
  metadata: Record<string, any> | null;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class ExportAccountDto {
  @ApiProperty({ description: 'User profile data' })
  profile: {
    id: string;
    username: string;
    email: string | null;
    firstname: string | null;
    lastname: string | null;
    avatar: string | null;
    tokens: number;
    totalScore: number;
    gamesPlayed: number;
    gamesWon: number;
    points: number;
    createdAt: Date;
  };

  @ApiProperty({
    type: [ExportNotificationDto],
    description: 'All notifications addressed to the user',
  })
  notifications: ExportNotificationDto[];

  @ApiProperty({
    description:
      'Privacy note explaining what data is on-chain and cannot be erased',
  })
  privacyNote: {
    offChain: string;
    onChain: string;
  };
}
