import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';

import { AuditAction, AuditResource, Permission } from '@bookorbit/types';
import { Auditable } from '../../common/decorators/auditable.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ForbidPermission } from '../../common/decorators/forbid-permission.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { FindNextSeriesBookDto } from './dto/find-next-series-book.dto';
import { ListSeriesBooksDto } from './dto/list-series-books.dto';
import { ListSeriesDto } from './dto/list-series.dto';
import { MarkSeriesReadDto } from './dto/mark-series-read.dto';
import { SeriesService } from './series.service';

@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser, @Query() dto: ListSeriesDto) {
    return this.seriesService.findAll(user, dto);
  }

  @Get(':seriesId/books')
  findBooks(@CurrentUser() user: RequestUser, @Param('seriesId', ParseIntPipe) seriesId: number, @Query() dto: ListSeriesBooksDto) {
    return this.seriesService.findBooks(user, seriesId, dto);
  }

  @Get(':seriesId/books/:bookId/next')
  findNextBook(
    @CurrentUser() user: RequestUser,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Param('bookId', ParseIntPipe) bookId: number,
    @Query() dto: FindNextSeriesBookDto,
  ) {
    return this.seriesService.findNextBook(user, seriesId, bookId, dto);
  }

  @Post(':seriesId/mark-read')
  @HttpCode(HttpStatus.OK)
  @ForbidPermission(Permission.DemoRestricted, 'Demo-restricted account cannot perform bulk edits')
  @Auditable({
    action: AuditAction.BookBulkSetStatus,
    resource: AuditResource.Book,
    description: (req, responseBody) => {
      const body = req.body as { upToIndex?: string };
      const count = (responseBody as { updated?: number } | undefined)?.updated ?? 0;
      const scope = body?.upToIndex ? `up to #${body.upToIndex}` : 'all';
      return `Marked ${count} book${count !== 1 ? 's' : ''} read in series ${req.params.seriesId} (${scope})`;
    },
  })
  markRead(@CurrentUser() user: RequestUser, @Param('seriesId', ParseIntPipe) seriesId: number, @Body() dto: MarkSeriesReadDto) {
    return this.seriesService.markRead(user, seriesId, dto);
  }

  @Put(':seriesId/follow')
  @HttpCode(HttpStatus.OK)
  follow(@CurrentUser() user: RequestUser, @Param('seriesId', ParseIntPipe) seriesId: number) {
    return this.seriesService.setFollowing(user, seriesId, true);
  }

  @Delete(':seriesId/follow')
  @HttpCode(HttpStatus.OK)
  unfollow(@CurrentUser() user: RequestUser, @Param('seriesId', ParseIntPipe) seriesId: number) {
    return this.seriesService.setFollowing(user, seriesId, false);
  }
}
