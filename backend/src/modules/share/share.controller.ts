import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ShareService } from './share.service';
import { CreateShareDto } from './dto/create-share.dto';
import { PlatformType } from './enums/platform-type.enum';
import { JwtAuthGuard } from '../../auth/guard/jwt-auth.guard';

@ApiTags('shares')
@Controller('shares')
@UseGuards(JwtAuthGuard)
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Create a new share' })
  @ApiResponse({ status: 201, description: 'Share created successfully' })
  async createShare(@Body() createShareDto: CreateShareDto) {
    return this.shareService.createShare(createShareDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get share by ID' })
  @ApiResponse({ status: 200, description: 'Share retrieved successfully' })
  async getShare(@Param('id') id: string) {
    return this.shareService.getShareById(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get shared content with filters' })
  @ApiResponse({ status: 200, description: 'Shared content retrieved successfully' })
  async getSharedContent(
    @Query('type') type?: string,
    @Query('platform') platform?: PlatformType,
    @Query('userId') userId?: string,
  ) {
    return this.shareService.getSharedContent({ type, platform, userId });
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get share analytics' })
  @ApiResponse({ status: 200, description: 'Share analytics retrieved successfully' })
  async getShareAnalytics(@Param('id') id: string) {
    return this.shareService.getShareAnalytics(id);
  }

  @Post(':id/view')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Track share view' })
  @ApiResponse({ status: 200, description: 'Share view tracked successfully' })
  async trackView(@Param('id') id: string) {
    return this.shareService.trackShareView(id);
  }

  @Post(':id/platform-share')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Generate platform-specific share content' })
  @ApiResponse({ status: 200, description: 'Platform share content generated successfully' })
  async generatePlatformShare(
    @Param('id') id: string,
    @Body('platform') platform: PlatformType,
  ) {
    return this.shareService.generatePlatformShare(id, platform);
  }
}
