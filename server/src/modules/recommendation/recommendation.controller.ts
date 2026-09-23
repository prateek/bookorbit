import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { RelatedShelfQueryDto } from './dto/related-shelf-query.dto';
import { RecommendationService } from './recommendation.service';

@Controller('books')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get(':id/recommendations')
  getRecommendations(@Param('id', ParseIntPipe) id: number, @Query() query: RelatedShelfQueryDto, @CurrentUser() user: RequestUser) {
    if (query.group === 'series') return this.recommendationService.getSimilarShelf(id, user);
    return this.recommendationService.getRecommendations(id, user);
  }

  @Get(':id/series-books')
  getSeriesBooks(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.recommendationService.getSeriesBooks(id, user);
  }

  @Get(':id/author-books')
  getAuthorBooks(@Param('id', ParseIntPipe) id: number, @Query() query: RelatedShelfQueryDto, @CurrentUser() user: RequestUser) {
    if (query.group === 'series') return this.recommendationService.getAuthorShelf(id, user);
    return this.recommendationService.getAuthorBooks(id, user);
  }
}
