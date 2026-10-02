import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CONTENT_FILTER_RULES, EPUB_READER_DEFAULTS } from '@bookorbit/types';
import type { RequestUser } from '../../common/types/request-user';
import { BookService } from '../book/book.service';
import { ReaderPreferencesRepository } from './reader-preferences.repository';
import { ReaderPreferencesService } from './reader-preferences.service';

const user: RequestUser = {
  id: 7,
  username: 'reader',
  name: 'Reader',
  email: null,
  active: true,
  isSuperuser: false,
  isDefaultPassword: false,
  tokenVersion: 1,
  settings: {},
  avatarUrl: null,
  provisioningMethod: 'local',
  permissions: [],
  contentFilters: EMPTY_CONTENT_FILTER_RULES,
};
const repo = {
  patchPreference: vi.fn<(...args: unknown[]) => Promise<void>>(),
  patchDefault: vi.fn<(...args: unknown[]) => Promise<void>>(),
  upsertDefault: vi.fn<(...args: unknown[]) => Promise<void>>(),
  findPreference: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
};
const book = { verifyFileAccess: vi.fn<(...args: unknown[]) => Promise<{ format: string }>>() };
let service: ReaderPreferencesService;

beforeEach(async () => {
  vi.resetAllMocks();
  book.verifyFileAccess.mockResolvedValue({ format: 'epub' });
  const module = await Test.createTestingModule({
    providers: [ReaderPreferencesService, { provide: ReaderPreferencesRepository, useValue: repo }, { provide: BookService, useValue: book }],
  }).compile();
  service = module.get(ReaderPreferencesService);
});

describe('reader layout preferences contract', () => {
  it.each(['hidden', 'progress', 'full'])('accepts %s and preserves sparse updates and response fields', async (informationDisplay) => {
    const set = { informationDisplay, verticalMargin: 0, gap: 0.03 };
    await service.patchPreference(user, 42, set);
    expect(book.verifyFileAccess).toHaveBeenCalledWith(42, user);
    expect(repo.patchPreference).toHaveBeenCalledWith(7, 42, set, []);
    await service.patchDefault(7, 'epub', set);
    expect(repo.patchDefault).toHaveBeenCalledWith(7, 'epub', expect.any(Object), set);
    repo.findPreference.mockResolvedValue({ settings: set });
    expect(await service.getPreference(user, 42)).toEqual({ settings: set });
  });

  it.each([{ verticalMargin: -1 }, { verticalMargin: 81 }, { verticalMargin: 1.5 }, { informationDisplay: 'clock' }])(
    'rejects unsupported layout values %j',
    async (set) => {
      await expect(service.patchPreference(user, 42, set)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.patchPreference).not.toHaveBeenCalled();
    },
  );

  it('accepts older clients without injecting layout fields into book overrides', async () => {
    const old = { ...EPUB_READER_DEFAULTS };
    delete old.verticalMargin;
    delete old.informationDisplay;
    await service.upsertDefault(7, 'epub', old);
    await service.patchPreference(user, 42, { fontSize: 17 });
    expect(repo.patchPreference).toHaveBeenCalledWith(7, 42, { fontSize: 17 }, []);
  });
});
