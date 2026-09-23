import { describe, expect, it } from 'vitest';

import { buildNewBooksMessage, mergeGroupsBySeries } from './new-books-message';

describe('buildNewBooksMessage', () => {
  it('lists each series with its count and links to the series when only one is involved', () => {
    expect(buildNewBooksMessage([{ seriesId: 7, seriesName: 'Chrysalis', count: 2, sampleBookId: 11 }])).toEqual({
      title: 'New chapters',
      body: 'Chrysalis: 2 new',
      url: '/series/7',
    });
  });

  it('orders series by count and links to home when several series changed', () => {
    const message = buildNewBooksMessage([
      { seriesId: 3, seriesName: 'The Sixth School', count: 1, sampleBookId: 20 },
      { seriesId: 7, seriesName: 'Chrysalis', count: 2, sampleBookId: 11 },
    ]);
    expect(message).toEqual({ title: 'New chapters', body: 'Chrysalis: 2 new, The Sixth School: 1 new', url: '/' });
  });

  it('summarises books outside a series and caps the number of series named', () => {
    const groups = [1, 2, 3, 4, 5].map((id) => ({ seriesId: id, seriesName: `S${id}`, count: 1, sampleBookId: id }));
    const message = buildNewBooksMessage([...groups, { seriesId: null, seriesName: null, count: 3, sampleBookId: 99 }]);
    expect(message?.title).toBe('New books');
    expect(message?.body).toBe('S1: 1 new, S2: 1 new, S3: 1 new, S4: 1 new, 1 more series, 3 other new');
    expect(message?.url).toBe('/');
  });

  it('opens a single new EPUB straight in the reader', () => {
    const message = buildNewBooksMessage([{ seriesId: 7, seriesName: 'Chrysalis', count: 1, sampleBookId: 11 }], {
      bookId: 11,
      title: 'Chapter 12',
      primaryFileId: 40,
      format: 'EPUB',
    });
    expect(message).toEqual({ title: 'New chapter', body: 'Chrysalis: Chapter 12', url: '/read/11/40?format=epub' });
  });

  it('falls back to the book page when a single book has no readable primary file', () => {
    const message = buildNewBooksMessage([{ seriesId: null, seriesName: null, count: 1, sampleBookId: 11 }], {
      bookId: 11,
      title: 'Audio thing',
      primaryFileId: 40,
      format: 'm4b',
    });
    expect(message).toEqual({ title: 'New book', body: 'Audio thing', url: '/book/11' });
  });

  it('returns null for an empty batch', () => {
    expect(buildNewBooksMessage([])).toBeNull();
  });
});

describe('mergeGroupsBySeries', () => {
  it('sums counts for the same series across libraries and keeps the lowest sample book', () => {
    expect(
      mergeGroupsBySeries([
        { seriesId: 7, seriesName: 'Chrysalis', count: 2, sampleBookId: 30 },
        { seriesId: 7, seriesName: 'Chrysalis', count: 1, sampleBookId: 12 },
        { seriesId: null, seriesName: null, count: 1, sampleBookId: 5 },
      ]),
    ).toEqual([
      { seriesId: 7, seriesName: 'Chrysalis', count: 3, sampleBookId: 12 },
      { seriesId: null, seriesName: null, count: 1, sampleBookId: 5 },
    ]);
  });
});
