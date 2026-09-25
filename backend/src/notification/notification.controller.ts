import { Controller, Get, Param, ParseBoolPipe, ParseUUIDPipe, Patch, Post, Query, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { NotificationService } from './providers/notification.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's notifications" })
  @ApiQuery({ name: 'unread', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Notifications successfully retrieved' })
  getNotifications(
    @CurrentUser('sub') userId: string,
    @Query('unread', new DefaultValuePipe(false), ParseBoolPipe) unread: boolean,
  ) {
    return this.notificationService.findForUser(userId, unread);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.markRead(userId, id);
  }

  @Post('mark-read')
  @ApiOperation({ summary: "Mark all of the current user's notifications as read" })
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.notificationService.markAllRead(userId);
  }
}
