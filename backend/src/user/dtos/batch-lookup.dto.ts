import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * LF-341: Payload for POST /api/v1/users/by-addresses (batch scoreboard lookup).
 */
export class BatchLookupDto {
  @ApiProperty({
    description:
      'List of Stellar wallet addresses to look up (max 100 per call).',
    type: [String],
    example: [
      'GABCDE...1',
      'GABCDE...2',
    ],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Provide at least one address.' })
  @ArrayMaxSize(100, { message: 'At most 100 addresses per request.' })
  @IsString({ each: true })
  addresses: string[];
}
