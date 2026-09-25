import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StateRecoveryService } from './state-recovery.service';
import { CreateStateRecoveryDto } from './dto/create-state-recovery.dto';
import { UpdateStateRecoveryDto } from './dto/update-state-recovery.dto';

@ApiTags('state-recovery')
@Controller('state-recovery')
export class StateRecoveryController {
  constructor(private readonly stateRecoveryService: StateRecoveryService) {}

  @Post()
  create(@Body() createStateRecoveryDto: CreateStateRecoveryDto) {
    return this.stateRecoveryService.create(createStateRecoveryDto);
  }

  @Get()
  findAll() {
    return this.stateRecoveryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stateRecoveryService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateStateRecoveryDto: UpdateStateRecoveryDto) {
    return this.stateRecoveryService.update(+id, updateStateRecoveryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.stateRecoveryService.remove(+id);
  }
}
