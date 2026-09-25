// src/sync/sync.controller.ts
import { Controller, Post, Body, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { SyncRequestDto } from './dto/sync-request.dto';
import { SyncResponseDto } from './dto/sync-response.dto';
import { DeltaUpdateDto } from './dto/delta-update.dto';
import { SyncHistory } from './entities/sync-history.entity';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}
  
  @Post()
  @ApiOperation({ summary: 'Sync data' })
  // @UseGuards(JwtAuthGuard)
  async syncData(@Body() syncRequest: SyncRequestDto<any>): Promise<SyncResponseDto<any>> {
    return this.syncService.sync(syncRequest);
  }
  
  @Post('delta')
  @ApiOperation({ summary: 'Apply delta update' })
  // @UseGuards(JwtAuthGuard)
  async applyDelta(@Body() deltaUpdate: DeltaUpdateDto<any>): Promise<SyncResponseDto<any>> {
    return this.syncService.applyDeltaUpdate(deltaUpdate);
  }
  
  @Get(':userId/:dataType')
  @ApiOperation({ summary: 'Get sync data for a specific data type' })
  // @UseGuards(JwtAuthGuard)
  async getSyncData(
    @Param('userId') userId: string,
    @Param('dataType') dataType: string,
  ): Promise<SyncResponseDto<any>> {
    return this.syncService.getSyncData(userId, dataType);
  }
  
  @Get(':userId/:dataType/history')
  @ApiOperation({ summary: 'Get sync history' })
  // @UseGuards(JwtAuthGuard)
  async getSyncHistory(
    @Param('userId') userId: string,
    @Param('dataType') dataType: string,
    @Query('limit') limit?: number,
  ): Promise<SyncHistory[]> {
    return this.syncService.getSyncHistory(userId, dataType, limit);
  }
  
  @Get(':userId/:dataType/patches/:fromVersion')
  @ApiOperation({ summary: 'Get patches from version' })
  // @UseGuards(JwtAuthGuard)
  async getPatches(
    @Param('userId') userId: string,
    @Param('dataType') dataType: string,
    @Param('fromVersion') fromVersion: number,
  ): Promise<any[]> {
    return this.syncService.generatePatches(userId, dataType, fromVersion);
  }
}