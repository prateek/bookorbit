import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

import { bookMetadata, libraries } from '../../db/schema';

/**
 * The unit a "books read" count counts. A book in a library with `countSeriesAsOneBook` on that
 * has a primary series counts as its series: within any counting window (a year, a month, all
 * time) every finished book of one series adds up to one book. Everything else counts as
 * `rowKey`, so passing a status or attempt id keeps the existing per-row semantics. Series units
 * are negated series ids, which cannot collide with the positive row keys.
 *
 * The enclosing query must join `libraries` on the book's library and `bookMetadata` on the book.
 */
export function bookCountUnitSql(rowKey: SQLWrapper): SQL<number> {
  return sql<number>`case when ${libraries.countSeriesAsOneBook} and ${bookMetadata.seriesId} is not null then -${bookMetadata.seriesId} else ${rowKey} end`;
}

export function countBookUnitsSql(rowKey: SQLWrapper): SQL<number> {
  return sql<number>`count(distinct ${bookCountUnitSql(rowKey)})::int`;
}
