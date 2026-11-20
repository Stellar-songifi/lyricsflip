import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('challenge')
@Controller('challenge')
export class ChallengeController {}
