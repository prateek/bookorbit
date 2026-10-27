import { z } from 'zod';
import { EXTERNAL_RUN_STATES } from '@bookorbit/types';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().max(2000);
const cursor = z
  .string()
  .max(512)
  .regex(/^[a-zA-Z0-9_.:-]+$/)
  .nullable();
export const runnerDescriptionSchema = z.object({
  protocolVersion: z.literal(1),
  instanceId: id,
  name: z.string().min(1).max(100),
  jobs: z
    .array(z.object({ id, label: z.string().min(1).max(100), canStart: z.boolean(), canCancel: z.boolean(), schedule: text.nullable() }))
    .max(100),
});
export const runnerRunSchema = z.object({
  id,
  jobId: id,
  origin: z.enum(['manual', 'schedule', 'external']),
  state: z.enum(EXTERNAL_RUN_STATES),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  phase: text.nullable(),
  counters: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/), z.number().int().nonnegative()).refine((v) => Object.keys(v).length <= 30),
  message: text.nullable(),
  childRunIds: z.array(id).max(100),
  importStatus: z.literal('unconfirmed'),
});
export const runnerPageSchema = z.object({ items: z.array(runnerRunSchema).max(100), nextCursor: cursor });
export const runnerEventsSchema = z.object({
  items: z.array(z.object({ id, timestamp: z.iso.datetime({ offset: true }), level: z.enum(['info', 'warning', 'error']), message: text })).max(100),
  nextCursor: cursor,
});
