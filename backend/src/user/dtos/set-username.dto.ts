import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * LF-341: Payload for PATCH /api/v1/users/me/username.
 *
 * Rules enforced here (structural) and in UsernameValidatorService (semantic):
 *  - 3–20 characters
 *  - Only lowercase letters, digits, and underscores ([a-z0-9_])
 *  - Not a reserved word or profane term (checked in the service layer)
 */
export class SetUsernameDto {
  @ApiProperty({
    description:
      'Desired username. 3–20 characters, lowercase letters/digits/underscores only.',
    example: 'stellar_wizard',
    minLength: 3,
    maxLength: 20,
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters.' })
  @MaxLength(20, { message: 'Username must be at most 20 characters.' })
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Username may only contain lowercase letters, digits, and underscores.',
  })
  username: string;
}
