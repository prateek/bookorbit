import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Permission } from '@bookorbit/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ForbidPermission } from '../../common/decorators/forbid-permission.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { RemovePushSubscriptionDto } from './dto/remove-push-subscription.dto';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';
import { PushService } from './push.service';

@Controller('push')
@RequirePermission(Permission.NotificationAccess)
@ForbidPermission(Permission.DemoRestricted, 'Demo-restricted account cannot receive push notifications')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  async getVapidPublicKey() {
    return { publicKey: await this.pushService.getPublicKey() };
  }

  @Post('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(@CurrentUser() user: RequestUser, @Body() dto: SavePushSubscriptionDto, @Headers('user-agent') userAgent?: string) {
    await this.pushService.subscribe(user.id, dto, userAgent ?? null);
  }

  @Delete('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@CurrentUser() user: RequestUser, @Body() dto: RemovePushSubscriptionDto) {
    await this.pushService.unsubscribe(user.id, dto.endpoint);
  }
}
