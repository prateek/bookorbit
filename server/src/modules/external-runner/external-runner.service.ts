import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ExternalRunnerConnection } from '@bookorbit/types';
import { externalRunners } from '../../db/schema/external-runners';
import { runnerUrl } from './runner-url';
import { RunnerRepository } from './runner.repository';
import { RunnerCredentialsService } from './runner-credentials.service';
import { RunnerClientService } from './runner-client.service';
import { RunnerPageDto, SaveRunnerDto, StartRunnerDto } from './dto/runner.dto';
import { runnerDescriptionSchema, runnerEventsSchema, runnerPageSchema, runnerRunSchema } from './runner-protocol';

type Runner = typeof externalRunners.$inferSelect;

@Injectable()
export class ExternalRunnerService {
  private readonly logger = new Logger(ExternalRunnerService.name);
  constructor(
    private readonly repo: RunnerRepository,
    private readonly credentials: RunnerCredentialsService,
    private readonly client: RunnerClientService,
  ) {}

  async list(userId: number, after = 0) {
    const rows = await this.repo.list(userId, after);
    return {
      items: rows.slice(0, 100).map(publicConnection),
      nextCursor: rows.length > 100 ? String(rows[99].id) : null,
      credentialsConfigured: this.credentials.isConfigured(),
    };
  }

  async save(userId: number, dto: SaveRunnerDto, id?: number) {
    const previous = id === undefined ? undefined : await this.owned(id, userId);
    const url = await runnerUrl(dto.baseUrl, dto.allowPrivateAddress);
    const baseUrl = url.href.replace(/\/+$/, '');
    if (previous && (baseUrl !== previous.baseUrl || dto.allowPrivateAddress !== previous.allowPrivateAddress) && !dto.token)
      throw new BadRequestException('Enter the runner token again when changing its URL or private-network policy.');
    if (!dto.name.trim()) throw new BadRequestException('Runner name is required.');
    if (!dto.token && !previous) throw new BadRequestException('Runner token is required.');
    const encryptedToken = dto.token ? this.credentials.encrypt(dto.token, `${userId}:${baseUrl}`) : previous!.encryptedToken;
    const value = {
      name: dto.name.trim(),
      baseUrl,
      encryptedToken,
      enabled: dto.enabled,
      allowPrivateAddress: dto.allowPrivateAddress,
    };
    const saved = previous ? await this.repo.update(previous.id, userId, value) : await this.repo.create({ ...value, userId });
    return publicConnection(saved);
  }

  async remove(id: number, userId: number) {
    await this.owned(id, userId);
    await this.repo.remove(id, userId);
  }

  async describe(id: number, userId: number) {
    return this.client.request(await this.endpoint(id, userId), 'capabilities', runnerDescriptionSchema);
  }

  async runs(id: number, userId: number, query: RunnerPageDto) {
    return this.client.request(await this.endpoint(id, userId), `runs?${pageQuery(query)}`, runnerPageSchema);
  }

  async run(id: number, userId: number, runId: string) {
    return this.client.request(await this.endpoint(id, userId), `runs/${safeId(runId)}`, runnerRunSchema);
  }

  async events(id: number, userId: number, runId: string, query: RunnerPageDto) {
    return this.client.request(await this.endpoint(id, userId), `runs/${safeId(runId)}/events?${pageQuery(query)}`, runnerEventsSchema);
  }

  async start(id: number, userId: number, dto: StartRunnerDto) {
    const endpoint = await this.endpoint(id, userId);
    const description = await this.client.request(endpoint, 'capabilities', runnerDescriptionSchema);
    if (!description.jobs.find((job) => job.id === dto.jobId)?.canStart) throw new BadRequestException('This job cannot be started remotely.');
    const started = Date.now();
    this.logger.log(`[external_runner.start] [start] runnerId=${id} userId=${userId} - execution requested`);
    try {
      const run = await this.client.request(endpoint, 'runs', runnerRunSchema, dto);
      this.logger.log(`[external_runner.start] [end] runnerId=${id} userId=${userId} durationMs=${Date.now() - started} - execution accepted`);
      return run;
    } catch (error) {
      this.logger.warn(
        `[external_runner.start] [fail] runnerId=${id} userId=${userId} durationMs=${Date.now() - started} errorClass=RunnerRequestError error="request not confirmed" - inspect status before retrying`,
      );
      throw error;
    }
  }

  async cancel(id: number, userId: number, runId: string, idempotencyKey: string) {
    const endpoint = await this.endpoint(id, userId);
    const run = await this.client.request(endpoint, `runs/${safeId(runId)}`, runnerRunSchema);
    const description = await this.client.request(endpoint, 'capabilities', runnerDescriptionSchema);
    if (!description.jobs.find((job) => job.id === run.jobId)?.canCancel) throw new BadRequestException('This job does not support cancellation.');
    return this.client.request(endpoint, `runs/${safeId(runId)}/cancel`, runnerRunSchema, { idempotencyKey });
  }

  private async owned(id: number, userId: number) {
    const row = await this.repo.find(id);
    if (!row) throw new NotFoundException('Runner connection not found.');
    if (row.userId !== userId) throw new ForbiddenException('This runner belongs to another user.');
    return row;
  }

  private async endpoint(id: number, userId: number) {
    const row = await this.owned(id, userId);
    if (!row.enabled) throw new BadRequestException('Runner connection is disabled. External schedules are unaffected.');
    return {
      baseUrl: row.baseUrl,
      allowPrivateAddress: row.allowPrivateAddress,
      token: this.credentials.decrypt(row.encryptedToken, `${userId}:${row.baseUrl}`),
    };
  }
}

function publicConnection(row: Runner): ExternalRunnerConnection {
  return { id: row.id, name: row.name, baseUrl: row.baseUrl, enabled: row.enabled, allowPrivateAddress: row.allowPrivateAddress };
}
function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new BadRequestException('Invalid runner identifier.');
  return id;
}
function pageQuery(query: RunnerPageDto): string {
  const params = new URLSearchParams({ limit: String(query.limit ?? 25) });
  if (query.cursor) params.set('cursor', query.cursor);
  return params.toString();
}
