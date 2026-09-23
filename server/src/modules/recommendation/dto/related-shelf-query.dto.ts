import { IsIn, IsOptional } from 'class-validator';

import type { RelatedShelfGrouping } from '@bookorbit/types';

const RELATED_SHELF_GROUPINGS: RelatedShelfGrouping[] = ['series'];

export class RelatedShelfQueryDto {
  /** `series` returns one card per series instead of one per book. Omitted keeps the per-book list. */
  @IsOptional()
  @IsIn(RELATED_SHELF_GROUPINGS)
  group?: RelatedShelfGrouping;
}
