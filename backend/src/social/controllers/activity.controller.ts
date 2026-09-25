import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('activity')
@Controller('activity')
export class ActivityController {}
