// src/practice/controllers/practice-item.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PracticeItemService } from '../services/practice-item.service';
import { CreatePracticeItemDto } from '../dto/create-practice-item.dto';
import { UpdatePracticeItemDto } from '../dto/update-practice-item.dto';

@ApiTags('practice-items')
@ApiBearerAuth()
@Controller('practice/items')
@UseGuards(JwtAuthGuard)
export class PracticeItemController {
  constructor(private readonly itemService: PracticeItemService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'instructor')
  create(@Body() createPracticeItemDto: CreatePracticeItemDto) {
    return this.itemService.create(createPracticeItemDto);
  }

  @Get()
  findAll() {
    return this.itemService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.itemService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'instructor')
  update(@Param('id') id: string, @Body() updatePracticeItemDto: UpdatePracticeItemDto) {
    return this.itemService.update(id, updatePracticeItemDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'instructor')
  remove(@Param('id') id: string) {
    return this.itemService.remove(id);
  }
}
