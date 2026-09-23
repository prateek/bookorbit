import 'reflect-metadata';

import type { RequestUser } from '../../common/types/request-user';
import { FORBIDDEN_PERMISSION_KEY } from '../../common/decorators/forbid-permission.decorator';
import { SeriesController } from './series.controller';
import { EMPTY_CONTENT_FILTER_RULES, Permission } from '@bookorbit/types';

function makeUser(overrides?: Partial<RequestUser>): RequestUser {
  return {
    id: 11,
    username: 'series-reader',
    name: 'Series Reader',
    email: null,
    active: true,
    isSuperuser: false,
    isDefaultPassword: false,
    tokenVersion: 1,
    settings: {},
    avatarUrl: null,
    provisioningMethod: 'local',
    permissions: [],
    ...overrides,

    contentFilters: EMPTY_CONTENT_FILTER_RULES,
  };
}

function makeController() {
  const seriesService = {
    findAll: vi.fn(),
    findBooks: vi.fn(),
    findNextBook: vi.fn(),
    markRead: vi.fn(),
  };

  const controller = new SeriesController(seriesService as any);
  return { controller, seriesService };
}

describe('SeriesController', () => {
  it('findAll delegates to service', async () => {
    const { controller, seriesService } = makeController();
    const user = makeUser();
    const dto = { page: 0, size: 50 };
    const expected = { items: [], total: 0, page: 0, size: 50 };
    seriesService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(user, dto as any);

    expect(seriesService.findAll).toHaveBeenCalledWith(user, dto);
    expect(result).toBe(expected);
  });

  it('findBooks delegates to service with numeric series id', async () => {
    const { controller, seriesService } = makeController();
    const user = makeUser();
    const dto = { page: 0, size: 50 };
    const expected = {
      items: [],
      total: 0,
      page: 0,
      size: 50,
      seriesInfo: { id: 42, name: 'Harry Potter', bookCount: 0, readCount: 0, authors: [], possibleGaps: [] },
    };
    seriesService.findBooks.mockResolvedValue(expected);

    const result = await controller.findBooks(user, 42, dto as any);

    expect(seriesService.findBooks).toHaveBeenCalledWith(user, 42, dto);
    expect(result).toBe(expected);
  });
  it('findNextBook delegates to service with numeric series and book ids', async () => {
    const { controller, seriesService } = makeController();
    const user = makeUser();
    const dto = { formatGroup: 'cbx' as const };
    const expected = { next: { bookId: 91, fileId: 501, format: 'cbz', title: 'Issue 10', seriesIndex: '10' } };
    seriesService.findNextBook.mockResolvedValue(expected);

    const result = await controller.findNextBook(user, 42, 90, dto);

    expect(seriesService.findNextBook).toHaveBeenCalledWith(user, 42, 90, dto);
    expect(result).toBe(expected);
  });

  it('markRead delegates to service and is closed to demo-restricted accounts', async () => {
    const { controller, seriesService } = makeController();
    const user = makeUser();
    seriesService.markRead.mockResolvedValue({ updated: 12 });

    const result = await controller.markRead(user, 42, { upToIndex: '12' });

    expect(seriesService.markRead).toHaveBeenCalledWith(user, 42, { upToIndex: '12' });
    expect(result).toEqual({ updated: 12 });
    expect(Reflect.getMetadata(FORBIDDEN_PERMISSION_KEY, SeriesController.prototype.markRead)).toMatchObject({
      permission: Permission.DemoRestricted,
    });
  });
});
