import type { BookRecommendation } from "./book";
import type { CoverAspectRatio } from "./library";

/** Query for the book detail related shelves; `series` returns one card per series instead of one per book. */
export type RelatedShelfGrouping = "series";

/** A series on a book's related shelf, standing in for all of its books the user can see. */
export type RelatedSeriesCard = {
  kind: "series";
  seriesId: number;
  name: string;
  authors: string[];
  bookCount: number;
  readCount: number;
  readingCount: number;
  /** The series lives in a library that counts a series as one book: its books are serial chapters. */
  isSerial: boolean;
  /** The first book in reading order, whose cover represents the series. */
  coverBookId: number;
  coverUpdatedAt: string | null;
  hasCover: boolean;
  coverAspectRatio: CoverAspectRatio;
  isAudiobook?: boolean;
  isComic?: boolean;
};

/** A book with no series on a related shelf. */
export type RelatedBookCard = BookRecommendation & { kind: "book" };

export type RelatedShelfItem = RelatedSeriesCard | RelatedBookCard;
