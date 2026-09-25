import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GenreHistory } from './entities/genre-history.entity';
import { GenreHistoryService } from './providers/genre-history.service';

@ApiTags('genre-history')
@Controller('genre-history')
export class GenreHistoryController {
  constructor(private readonly genreHistoryService: GenreHistoryService) {}

  @Get()
  findAll() {
    return this.genreHistoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.genreHistoryService.findOne(id);
  }

  @Post()
  create(@Body() genreHistory: Partial<GenreHistory>) {
    return this.genreHistoryService.create(genreHistory);
  }
}
