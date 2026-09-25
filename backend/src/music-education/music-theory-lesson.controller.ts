import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('music-education')
@Controller('music-education')
export class MusicEducationController {
  @Get('overview')
  getOverview() {
    return {
      message: 'Welcome to the Music Education API!',
      features: [
        'Quiz',
        'Music Lessons',
        'Genre History',
        'Artists',
        'User Progress',
      ],
    };
  }
}
