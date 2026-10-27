import { registerAs } from '@nestjs/config';

export const externalRunnerConfig = registerAs('externalRunner', () => ({
  encryptionKey: process.env.EXTERNAL_RUNNER_ENCRYPTION_KEY ?? '',
}));
