import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QuizService } from './providers/quiz.service';
import { Quiz } from './entities/quiz.entity';

@ApiTags('quiz')
@Controller('quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get()
  findAll() {
    return this.quizService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.quizService.findOne(id);
  }

  @Post()
  create(@Body() quiz: Partial<Quiz>) {
    return this.quizService.create(quiz);
  }
}
