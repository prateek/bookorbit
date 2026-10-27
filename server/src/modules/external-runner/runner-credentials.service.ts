import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { externalRunnerConfig } from './external-runner.config';

@Injectable()
export class RunnerCredentialsService {
  private readonly key: Buffer | null;

  constructor(@Inject(externalRunnerConfig.KEY) config: ConfigType<typeof externalRunnerConfig>) {
    this.key = /^[a-f0-9]{64}$/i.test(config.encryptionKey) ? Buffer.from(config.encryptionKey, 'hex') : null;
  }

  isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(token: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.requireKey(), iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from(context));
    const bytes = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
  }

  decrypt(value: string, context: string): string {
    const key = this.requireKey();
    try {
      const bytes = Buffer.from(value, 'base64');
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12), { authTagLength: 16 });
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    } catch {
      throw new BadRequestException('Runner credentials cannot be decrypted. Restore the encryption key or save the token again.');
    }
  }

  private requireKey(): Buffer {
    if (!this.key) throw new BadRequestException('Set EXTERNAL_RUNNER_ENCRYPTION_KEY to a 64-character hex key before saving runner credentials.');
    return this.key;
  }
}
