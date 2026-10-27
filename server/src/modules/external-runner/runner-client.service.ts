import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { runnerUrl } from './runner-url';
import { safeFetch } from '../../common/utils/safe-fetch';
import { readBoundedText } from '../../common/utils/bounded-response';

export interface RunnerEndpoint {
  baseUrl: string;
  token: string;
  allowPrivateAddress: boolean;
}

@Injectable()
export class RunnerClientService {
  private readonly logger = new Logger(RunnerClientService.name);
  async request<T>(endpoint: RunnerEndpoint, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const started = Date.now();
    const method = body === undefined ? 'GET' : 'POST';
    this.logger.debug(`[external_runner.request] [start] method=${method} - runner request started`);
    const url = await runnerUrl(endpoint.baseUrl, endpoint.allowPrivateAddress);
    const [pathname, query] = path.split('?');
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${pathname}`;
    url.search = query ?? '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await safeFetch(
        url.href,
        {
          method: body === undefined ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${endpoint.token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          redirect: 'manual',
        },
        { allowPrivate: endpoint.allowPrivateAddress, pinResolvedAddress: true },
      );
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 409) throw new ConflictException('Runner is busy. No additional execution was started.');
        if (response.status === 404) throw new NotFoundException('Runner job or execution was not found.');
        throw new BadGatewayException(
          response.status === 401 || response.status === 403
            ? 'Runner rejected its connection credentials.'
            : `Runner returned HTTP ${response.status}.`,
        );
      }
      const parsed = schema.safeParse(JSON.parse(await readBoundedText(response, 512 * 1024)));
      if (!parsed.success) throw new BadGatewayException('Runner returned an invalid protocol response.');
      this.logger.debug(`[external_runner.request] [end] method=${method} durationMs=${Date.now() - started} - runner response validated`);
      return parsed.data;
    } catch (error) {
      this.logger.warn(
        `[external_runner.request] [fail] method=${method} durationMs=${Date.now() - started} errorClass=RunnerRequestError error="request failed" - runner response unavailable`,
      );
      if (error instanceof BadGatewayException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException(
        'Runner status is unavailable. An accepted execution may still be running; retry with the same request key.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
