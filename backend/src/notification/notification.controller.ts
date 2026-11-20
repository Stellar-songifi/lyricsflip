import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationService } from './providers/notification.service';
import { UpdatePreferenceDto } from './dto/update-preferences.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ── Notification list ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "Get the current user's notifications" })
  @ApiQuery({ name: 'unread', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Notifications successfully retrieved' })
  getNotifications(
    @CurrentUser('sub') userId: string,
    @Param('unread', new DefaultValuePipe(false), ParseBoolPipe)
    unread: boolean,
  ) {
    return this.notificationService.findForUser(userId, unread);
  }

  @Get('unread-count')
  @ApiOperation({ summary: "Get the current user's unread notification count" })
  @ApiResponse({ status: 200, description: 'Unread count successfully retrieved' })
  async getUnreadCount(
    @CurrentUser('sub') userId: string,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.countUnread(userId);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.markRead(userId, id);
  }

  @Post('mark-read')
  @ApiOperation({ summary: "Mark all of the current user's notifications as read" })
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.notificationService.markAllRead(userId);
  }

  // ── Opt-out preferences ──────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({
    summary: "Get the current user's notification opt-out preferences",
    description:
      'Returns a nested map of { type: { channel: enabled } }. ' +
      'Missing entries default to enabled (true).',
  })
  @ApiResponse({ status: 200, description: 'Preference map returned' })
  getPreferences(@CurrentUser('sub') userId: string) {
    return this.notificationService.getPreferences(userId);
  }

  @Put('preferences')
  @ApiOperation({
    summary: 'Update a single notification opt-out preference',
    description:
      'Set enabled=false to opt out of a type+channel combination. ' +
      'Supported channels: in_app, email.',
  })
  @ApiResponse({ status: 200, description: 'Preference updated' })
  updatePreference(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePreferenceDto,
  ) {
    return this.notificationService.updatePreference(userId, dto);
  }
}
