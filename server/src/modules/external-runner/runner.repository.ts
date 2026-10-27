import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import { externalRunners } from '../../db/schema/external-runners';

@Injectable()
export class RunnerRepository {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  list(userId: number, after = 0) {
    return this.db
      .select()
      .from(externalRunners)
      .where(and(eq(externalRunners.userId, userId), gt(externalRunners.id, after)))
      .orderBy(asc(externalRunners.id))
      .limit(101);
  }

  async find(id: number) {
    const [row] = await this.db.select().from(externalRunners).where(eq(externalRunners.id, id)).limit(1);
    return row;
  }

  async create(value: typeof externalRunners.$inferInsert) {
    const [row] = await this.db.insert(externalRunners).values(value).returning();
    return row;
  }

  async update(id: number, userId: number, value: Partial<typeof externalRunners.$inferInsert>) {
    const [row] = await this.db
      .update(externalRunners)
      .set(value)
      .where(and(eq(externalRunners.id, id), eq(externalRunners.userId, userId)))
      .returning();
    return row;
  }

  async remove(id: number, userId: number) {
    await this.db.delete(externalRunners).where(and(eq(externalRunners.id, id), eq(externalRunners.userId, userId)));
  }
}
