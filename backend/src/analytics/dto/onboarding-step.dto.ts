import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum OnboardingFunnelStep {
  WALLET_CONNECTED = 'wallet_connected',
  FUNDED = 'funded',
  FUNDING_SKIPPED = 'funding_skipped',
  USERNAME_SET = 'username_set',
  TUTORIAL_STARTED = 'tutorial_started',
}

export class OnboardingStepDto {
  @ApiProperty({ enum: OnboardingFunnelStep })
  @IsEnum(OnboardingFunnelStep)
  step: OnboardingFunnelStep;
}
