import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';

export type SqlSortDirection = 'ASC' | 'DESC';
export type SeriesIndexComparisonOperator = '>' | '>=' | '<' | '<=';

export function seriesIndexSortKeySql(columnSql: string): string {
  return `CASE WHEN ${columnSql} IS NULL THEN NULL ELSE ARRAY[
      split_part(${columnSql}::text, '.', 1)::numeric,
      CASE WHEN strpos(${columnSql}::text, '.') = 0 THEN -1::numeric ELSE split_part(${columnSql}::text, '.', 2)::numeric END
    ] END`;
}

export function seriesIndexSortKey(value: SQLWrapper | string): SQL {
  return sql`CASE WHEN ${value} IS NULL THEN NULL ELSE ARRAY[
      split_part(${value}::text, '.', 1)::numeric,
      CASE WHEN strpos(${value}::text, '.') = 0 THEN -1::numeric ELSE split_part(${value}::text, '.', 2)::numeric END
    ] END`;
}

export function seriesIndexOrderBy(value: SQLWrapper, direction: SqlSortDirection): SQL[] {
  return [sql`${seriesIndexSortKey(value)} ${sql.raw(direction)} NULLS LAST`, sql`${value}::text COLLATE "C" ${sql.raw(direction)} NULLS LAST`];
}

/**
 * Series reading order: the series index, then the release date. Web serials leave many chapters
 * unnumbered or share one index across several, and those ties read in release order rather than
 * in whatever order they happened to be imported.
 */
export function seriesReadingOrderBy(seriesIndex: SQLWrapper, publishedDate: SQLWrapper, direction: SqlSortDirection): SQL[] {
  return [...seriesIndexOrderBy(seriesIndex, direction), publishedDateOrderBy(publishedDate, direction)];
}

export function publishedDateOrderBy(publishedDate: SQLWrapper, direction: SqlSortDirection): SQL {
  return sql`${publishedDate} ${sql.raw(direction)} NULLS LAST`;
}

export function compareSeriesIndexSql(column: SQLWrapper, operator: SeriesIndexComparisonOperator, value: string): SQL {
  // The compared value is a bound parameter, and Postgres cannot infer a type for one that appears
  // bare in a null test (42P18). Only the literal side is cast: casting the column side instead
  // would stop the sort key matching the expression index the series ordering relies on.
  const literal = sql`${value}::text`;
  return sql`(${seriesIndexSortKey(column)}, ${column}::text COLLATE "C") ${sql.raw(operator)} (${seriesIndexSortKey(literal)}, ${literal} COLLATE "C")`;
}
