import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notif: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('unread') unread?: string) {
    return this.notif.list(user, unread === 'true');
  }

  @Get('count')
  count(@CurrentUser() user: AuthenticatedUser) {
    return this.notif.unreadCount(user);
  }

  @Post(':id/read')
  read(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notif.markRead(user, id);
  }

  @Post(':id/acknowledge')
  ack(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notif.acknowledge(user, id);
  }
}
