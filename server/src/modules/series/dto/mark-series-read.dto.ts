import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

import { SERIES_INDEX_MAX_LENGTH, SERIES_INDEX_PATTERN } from '@bookorbit/types';

export class MarkSeriesReadDto {
  /** Marks only the books numbered at or below this index in the series; omitted marks every book. */
  @IsOptional()
  @IsString()
  @MaxLength(SERIES_INDEX_MAX_LENGTH)
  @Matches(SERIES_INDEX_PATTERN)
  upToIndex?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  libraryId?: number;
}
