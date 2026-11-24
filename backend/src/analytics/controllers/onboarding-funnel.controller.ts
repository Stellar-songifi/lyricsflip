import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OnboardingStepDto } from '../dto/onboarding-step.dto';
import { OnboardingFunnelService } from '../services/onboarding-funnel.service';

@ApiTags('Analytics')
@Controller('analytics/onboarding')
export class OnboardingFunnelController {
  constructor(private readonly funnel: OnboardingFunnelService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Record an anonymous onboarding funnel step',
    description:
      'Stores only a daily aggregate count for the provided step. No user or wallet identifier is accepted.',
  })
  @ApiResponse({ status: 202, description: 'Step recorded' })
  async recordStep(@Body() body: OnboardingStepDto): Promise<{ accepted: true }> {
    await this.funnel.recordStep(body.step);
    return { accepted: true };
  }
}
