import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { NotificationType } from '@bookorbit/types';
import { DB } from '../../db';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';

it('selects only a bounded snapshot page under its owner', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [['New chapters', '2 new', 2, 7, [11, 12]]] });
  const db = drizzle({ client: { query } as unknown as Pool });
  const module = await Test.createTestingModule({ providers: [NotificationRepository, { provide: DB, useValue: db }] }).compile();
  const page = await module.get(NotificationRepository).findArrival(42, 'batch', 50, 100);
  expect(page).toEqual({ title: 'New chapters', message: '2 new', total: 2, seriesId: 7, bookIds: [11, 12] });
  const [statement, parameters] = query.mock.calls[0];
  expect(statement.text).toContain('LIMIT $1 OFFSET $2');
  expect(statement.text).toContain('"notifications"."user_id" = $3');
  expect(parameters).toEqual([50, 100, 42, NotificationType.NewBooks, '/new-arrivals/batch', 1]);
  await module.close();
});

it('keeps stored arrival book lists out of the notification feed', async () => {
  const now = new Date();
  const module = await Test.createTestingModule({
    providers: [
      NotificationService,
      {
        provide: NotificationRepository,
        useValue: {
          findByUser: vi.fn().mockResolvedValue({
            items: [
              {
                id: 1,
                type: NotificationType.NewBooks,
                title: 'New books',
                message: '2 new',
                actionUrl: '/new-arrivals/batch',
                meta: { bookIds: [11, 12] },
                read: false,
                count: 1,
                createdAt: now,
                updatedAt: now,
              },
            ],
            total: 1,
          }),
        },
      },
      { provide: NotificationGateway, useValue: {} },
    ],
  }).compile();
  const page = await module.get(NotificationService).list(42, 20, 0);
  expect(page.items[0].meta).toBeNull();
  expect(page.items[0].actionUrl).toBe('/new-arrivals/batch');
  await module.close();
});
