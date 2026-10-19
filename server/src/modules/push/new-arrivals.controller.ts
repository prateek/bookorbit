import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Permission, type NewArrivalsPage } from '@bookorbit/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ForbidPermission } from '../../common/decorators/forbid-permission.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { BookService } from '../book/book.service';
import { NotificationService } from '../notification/notification.service';
import { ListArrivalsDto } from './dto/list-arrivals.dto';

@Controller('push/arrivals')
@RequirePermission(Permission.NotificationAccess)
@ForbidPermission(Permission.DemoRestricted, 'Demo-restricted account cannot access notifications')
export class NewArrivalsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly books: BookService,
  ) {}

  @Get(':token')
  async page(
    @CurrentUser() user: RequestUser,
    @Param('token', ParseUUIDPipe) token: string,
    @Query() query: ListArrivalsDto,
  ): Promise<NewArrivalsPage> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const arrival = await this.notifications.getArrival(user.id, token, limit, offset);
    const ids = arrival.bookIds;
    const page = await this.books.globalQuery(
      user,
      {
        sort: [],
        pagination: { page: 0, size: limit },
      },
      ids,
    );
    const byId = new Map(page.items.map((book) => [book.id, book]));
    return {
      title: arrival.title,
      message: arrival.message,
      seriesId: arrival.seriesId,
      items: ids.flatMap((id) => {
        const book = byId.get(id);
        return book ? [book] : [];
      }),
      total: arrival.total,
      offset,
      hasMore: offset + limit < arrival.total,
    };
  }
}
