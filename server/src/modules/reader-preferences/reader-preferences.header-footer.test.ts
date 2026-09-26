import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EPUB_READER_DEFAULTS } from '@bookorbit/types';

import { BookService } from '../book/book.service';
import { ReaderPreferencesRepository } from './reader-preferences.repository';
import { ReaderPreferencesService } from './reader-preferences.service';

const mockRepo = {
  upsertDefault: vi.fn<(...args: [number, string, Record<string, unknown>]) => Promise<void>>(),
  patchDefault: vi.fn<(...args: [number, string, Record<string, unknown>, Record<string, unknown>]) => Promise<void>>(),
};

describe('ReaderPreferencesService header and footer settings', () => {
  let service: ReaderPreferencesService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.upsertDefault.mockResolvedValue(undefined);
    mockRepo.patchDefault.mockResolvedValue(undefined);
    service = new ReaderPreferencesService(mockRepo as unknown as ReaderPreferencesRepository, {} as BookService);
  });

  it('accepts full epub defaults with or without the slots, so older clients keep saving', async () => {
    const withoutSlots = Object.fromEntries(
      Object.entries(EPUB_READER_DEFAULTS).filter(([key]) => !['runningHead', 'footerLeft', 'footerRight'].includes(key)),
    );

    await service.upsertDefault(1, 'epub', withoutSlots);
    await service.upsertDefault(1, 'epub', { ...withoutSlots, runningHead: 'off', footerLeft: 'pages-left', footerRight: 'off' });

    expect(mockRepo.upsertDefault).toHaveBeenLastCalledWith(
      1,
      'epub',
      expect.objectContaining({ runningHead: 'off', footerLeft: 'pages-left', footerRight: 'off' }),
    );
  });

  it('rejects an unknown slot value', async () => {
    await expect(service.patchDefault(1, 'epub', { runningHead: 'book' })).rejects.toThrow(BadRequestException);
    await expect(service.patchDefault(1, 'epub', { footerLeft: 'percent' })).rejects.toThrow(BadRequestException);
    await expect(service.patchDefault(1, 'epub', { footerRight: 'page' })).rejects.toThrow(BadRequestException);
  });
});
