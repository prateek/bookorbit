import type { BookCard } from "./book";

export interface NewArrivalsPage {
  title: string;
  message: string | null;
  seriesId: number | null;
  items: BookCard[];
  total: number;
  offset: number;
  hasMore: boolean;
}
