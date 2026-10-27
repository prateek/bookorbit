import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Permission } from '@bookorbit/types';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionService } from '../../common/services/permission.service';
import { forgetDispatchers } from '../../common/utils/safe-fetch';
import { ExternalRunnerController } from './external-runner.controller';
import { ExternalRunnerService } from './external-runner.service';
import { RunnerClientService } from './runner-client.service';
import { RunnerCredentialsService } from './runner-credentials.service';
import { RunnerRepository } from './runner.repository';
import { externalRunnerConfig } from './external-runner.config';

const token = 'runner-fixture-token-never-return-to-browser';
const run = {
  id: 'exec_1',
  jobId: 'sync',
  origin: 'manual',
  state: 'running',
  startedAt: '2026-10-27T12:00:00Z',
  finishedAt: null,
  phase: 'Fetching',
  counters: { held: 4, published: 2 },
  message: null,
  childRunIds: [],
  importStatus: 'unconfirmed',
};
let app: NestFastifyApplication;
let remote: Server;
let baseUrl: string;
let mode = 'normal';
const seen: Array<{ path: string; auth: string | undefined; body: unknown }> = [];
let rows: Array<Record<string, unknown>> = [];
const repo = {
  list: vi.fn((userId: number) => Promise.resolve(rows.filter((row) => row.userId === userId))),
  find: vi.fn((id: number) => Promise.resolve(rows.find((row) => row.id === id))),
  create: vi.fn((value) => {
    const row = { id: rows.length + 1, ...value };
    rows.push(row);
    return Promise.resolve(row);
  }),
  update: vi.fn((id, userId, value) => {
    const row = rows.find((r) => r.id === id && r.userId === userId)!;
    Object.assign(row, value);
    return Promise.resolve(row);
  }),
  remove: vi.fn((id, userId) => {
    rows = rows.filter((row) => row.id !== id || row.userId !== userId);
    return Promise.resolve();
  }),
};
const auth = { 'x-user': '1', 'x-permissions': `${Permission.ManageLibraries},${Permission.ManageAppSettings}` };

beforeAll(async () => {
  remote = createServer((req, res) => {
    void (async () => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      seen.push({ path: req.url!, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'redirect') {
        res.writeHead(302, { Location: '/stolen' }).end();
        return;
      }
      if (mode === 'oversized') {
        res.end('x'.repeat(600 * 1024));
        return;
      }
      if (mode === 'malformed') {
        res.end(JSON.stringify({ items: [{ state: 'pretend-success' }] }));
        return;
      }
      if (req.url === '/bridge/capabilities') {
        res.end(
          JSON.stringify({
            protocolVersion: 1,
            instanceId: 'fixture',
            name: mode === 'second' ? 'Alternate Tool' : 'Example Tool',
            jobs: [{ id: 'sync', label: 'Configured job', canStart: true, canCancel: false, schedule: null }],
          }),
        );
      } else if (req.method === 'POST') {
        res.writeHead(mode === 'busy' ? 409 : 202).end(JSON.stringify(run));
      } else if (req.url?.includes('/events')) {
        res.end(
          JSON.stringify({
            items: [{ id: 'event_1', timestamp: run.startedAt, level: 'info', message: 'Output delivered; import unconfirmed.' }],
            nextCursor: null,
          }),
        );
      } else if (req.url === '/bridge/runs/exec_1') {
        res.end(JSON.stringify(run));
      } else {
        res.end(JSON.stringify({ items: [run], nextCursor: '42' }));
      }
    })().catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((resolve) => remote.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(remote.address() as { port: number }).port}/bridge`;
  const module = await Test.createTestingModule({
    controllers: [ExternalRunnerController],
    providers: [
      ExternalRunnerService,
      RunnerClientService,
      RunnerCredentialsService,
      { provide: RunnerRepository, useValue: repo },
      { provide: externalRunnerConfig.KEY, useValue: { encryptionKey: 'ab'.repeat(32) } },
    ],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('preHandler', (req: { headers: Record<string, string>; user: unknown }) => {
      req.user = { id: Number(req.headers['x-user'] || 1), isSuperuser: false, permissions: (req.headers['x-permissions'] || '').split(',') };
      return Promise.resolve();
    });
  app.useGlobalGuards(new PermissionGuard(new Reflector(), new PermissionService()));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  forgetDispatchers();
  await new Promise<void>((resolve) => remote.close(() => resolve()));
});
beforeEach(async () => {
  rows = [];
  seen.length = 0;
  mode = 'normal';
  await app.inject({
    method: 'POST',
    url: '/api/v1/external-runners',
    headers: auth,
    payload: { name: 'My runner', baseUrl, token, enabled: true, allowPrivateAddress: true },
  });
});

function inject(path = '', options: Record<string, unknown> = {}) {
  return app.inject({ method: 'GET', url: `/api/v1/external-runners${path}`, headers: auth, ...options } as never);
}

describe('external runner HTTP boundary', () => {
  it('encrypts tokens and returns only owner-scoped public connections', async () => {
    expect(rows[0].encryptedToken).not.toContain(token);
    const result = await inject();
    expect(result.statusCode).toBe(200);
    expect(result.json().items).toHaveLength(1);
    expect(result.body).not.toMatch(/encryptedToken|userId|runner-fixture-token/);
    const other = await inject('', { headers: { ...auth, 'x-user': '2' } });
    expect(other.json().items).toEqual([]);
    expect((await inject('/1/runs', { headers: { ...auth, 'x-user': '2' } })).statusCode).toBe(403);
    expect(seen).toEqual([]);
  });
  it('enforces backend permissions and rejects unexpected command fields', async () => {
    expect(
      (await inject('/1/runs', { method: 'POST', headers: { 'x-user': '1' }, payload: { jobId: 'sync', idempotencyKey: randomUUID() } })).statusCode,
    ).toBe(403);
    expect((await inject('/1/runs', { method: 'POST', payload: { jobId: 'sync', idempotencyKey: randomUUID(), command: 'sh' } })).statusCode).toBe(
      400,
    );
    expect((await inject('/1/runs?limit=100000')).statusCode).toBe(400);
    expect(seen).toEqual([]);
  });
  it.each(['normal', 'second'])('uses the same contract for backend %s and preserves request keys', async (backend) => {
    mode = backend;
    const key = randomUUID();
    const result = await inject('/1/runs', { method: 'POST', payload: { jobId: 'sync', idempotencyKey: key } });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toEqual(run);
    expect(seen.at(-1)).toEqual({ path: '/bridge/runs', auth: `Bearer ${token}`, body: { jobId: 'sync', idempotencyKey: key } });
    const page = await inject('/1/runs?cursor=123&limit=10');
    expect(page.json().nextCursor).toBe('42');
    expect(seen.at(-1)?.path).toBe('/bridge/runs?limit=10&cursor=123');
  });
  it('refuses unsupported cancellation before sending a mutation', async () => {
    const result = await inject('/1/runs/exec_1/cancel', { method: 'POST', payload: { idempotencyKey: randomUUID() } });
    expect(result.statusCode).toBe(400);
    expect(seen.every((item) => !item.path.endsWith('/cancel'))).toBe(true);
  });
  it.each(['redirect', 'oversized', 'malformed'])('does not expose or accept %s responses', async (failure) => {
    mode = failure;
    const result = await inject('/1/runs');
    expect(result.statusCode).toBeGreaterThanOrEqual(500);
    expect(result.body).not.toContain(token);
    expect(seen).toHaveLength(1);
  });
  it('reports busy separately and disabled connections do not contact the backend', async () => {
    mode = 'busy';
    expect((await inject('/1/runs', { method: 'POST', payload: { jobId: 'sync', idempotencyKey: randomUUID() } })).statusCode).toBe(409);
    rows[0].enabled = false;
    seen.length = 0;
    expect((await inject('/1/runs')).statusCode).toBe(400);
    expect(seen).toEqual([]);
  });
  it('requires a new token when the destination or private-network policy changes', async () => {
    const payload = { name: 'Updated', baseUrl: baseUrl + '/other', enabled: true, allowPrivateAddress: true };
    expect((await inject('/1', { method: 'PUT', payload })).statusCode).toBe(400);
    expect(rows[0].baseUrl).toBe(baseUrl);
    expect((await inject('/1', { method: 'PUT', payload: { ...payload, token: 'replacement-fixture-token' } })).statusCode).toBe(200);
  });
  it('allows a name-only edit to preserve credentials', async () => {
    const cipher = rows[0].encryptedToken;
    expect((await inject('/1', { method: 'PUT', payload: { name: 'Renamed', baseUrl, enabled: true, allowPrivateAddress: true } })).statusCode).toBe(
      200,
    );
    expect(rows[0].encryptedToken).toBe(cipher);
  });
  it('requires both permissions for connection mutations', async () => {
    expect((await inject('/1', { method: 'DELETE', headers: { 'x-user': '1', 'x-permissions': Permission.ManageAppSettings } })).statusCode).toBe(
      403,
    );
  });
  it('rejects public and link-local plaintext endpoints even with private opt-in', async () => {
    for (const address of ['8.8.8.8', '169.254.169.254', '[fe80::1]', 'localhost']) {
      const result = await inject('', {
        method: 'POST',
        payload: { name: 'Unsafe', baseUrl: `http://${address}`, token, enabled: true, allowPrivateAddress: true },
      });
      expect(result.statusCode).toBe(400);
    }
  });
  it('blocks private addresses unless the owner opts in', async () => {
    rows[0].allowPrivateAddress = false;
    expect((await inject('/1/runs')).statusCode).toBe(400);
    expect(seen).toEqual([]);
  });
});
